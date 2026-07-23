/**
 * Pure projection scaffold for the next-gen chat (`Frontend:NextGenChat`).
 *
 * Walks raw `CliOutputLine[]` plus optional run / token / screenshot / commit
 * / job context and yields a sequence of `ConversationEvent`s. The function
 * MUST stay free of Angular services and DOM state so it can be unit-tested
 * deterministically against fixture log fragments.
 *
 * The classification rules here mirror the v6 edge-case taxonomy in
 * `docs/mockups/chat-window-next-gen/activity-log-edge-cases.md` and the
 * v7 workbench events listed in
 * `docs/mockups/chat-window-next-gen/integration-plan.md`. Renderers
 * should not pattern-match raw lines themselves; they should consume
 * `ConversationEvent[]`.
 */

import type {
  CliOutputLine,
  GitFileChange,
  RunInfoLite,
  RunTimelineLite,
  TaskInfoLite,
  TokenSummaryLite
} from './projection-inputs';
import {
  parseActivityLog,
  isCodexTextModeTranscriptFailure,
  type ActivityLogGroup,
  type ActivityLogKind,
  normalizeVisibleChatBody,
} from './activity-log.parser';
import { shortModelLabel } from './composer-controls';
import type {
  ConversationEvent,
  ConversationEventSeverity,
  PlanItem,
  PlanItemStatus,
  RawLineRange,
  ToolCommandExecution,
  ToolOutputHit,
  ToolFamily,
  TraceLink,
  WorkbenchSummaryAggregate
} from './conversation-event';

export interface ScreenshotEvidence {
  /** Caption / alt text. */
  caption: string;
  /** Original (often scratch) path. */
  sourcePath: string;
  /** Durable copy under `results/` after curation, when known. */
  durablePath?: string | null;
  sourceTool?: string;
  /** Optional ISO timestamp the host already attached. */
  timestamp?: string;
  taskLink?: string;
}

export interface CommitEvidence {
  sha: string;
  shortSha: string;
  subject: string;
  authorDateUtc: string;
  files: readonly GitFileChange[];
  runIndex?: number;
}

export interface ConversationProjectionContext {
  /** Source identifier kept on every `RawLineRange` (job id is preferred). */
  source: string;
  /** Raw activity log lines. The projection numbers them 1-based for ranges. */
  lines: readonly CliOutputLine[];
  task?: TaskInfoLite | null;
  runTimeline?: RunTimelineLite | null;
  tokenSummary?: TokenSummaryLite | null;
  screenshots?: readonly ScreenshotEvidence[];
  commits?: readonly CommitEvidence[];
  /** When true, runs are emitted as `runMarker` events even if the timeline is empty. */
  emitRunMarkers?: boolean;
  /** When true, the projection appends a `workbench.summary` event for the whole transcript. */
  emitWorkbenchSummary?: boolean;
  /** When true, the projection appends a `workbench.gitPreview` and `workbench.visualPreview` event when evidence exists. */
  emitWorkbenchPreviews?: boolean;
  /** When true, a final `traceLink` event is appended pointing at the raw log. */
  emitTraceLink?: boolean;
  /** When true, a `workbench.debug` aggregate is appended for the Verbose Debug pane. */
  emitDebugAggregate?: boolean;
  /** Latest run result string the host knows about (e.g. `[[TASK_DONE]]`, `heuristic-noop`). */
  latestResult?: string;
}

/** Public entry point — returns a flat, ordered list of conversation events. */
export function projectConversation(
  ctx: ConversationProjectionContext
): ConversationEvent[] {
  const events: ConversationEvent[] = [];
  const lineNumbers = numberLines(ctx.lines);
  const groups = parseActivityLog([...ctx.lines]);
  // Map activity-log groups back to their 1-based source line ranges so each
  // emitted event keeps a faithful raw range. The parser preserves line
  // identity through merges, so the lookup-by-reference is safe.
  const indexByLine = new Map<CliOutputLine, number>();
  ctx.lines.forEach((l, i) => indexByLine.set(l, i + 1));

  let currentRun: RunContext = pickInitialRun(ctx.runTimeline ?? null);
  const runByLineIndex = buildRunIndex(ctx.lines, ctx.runTimeline ?? null);
  const seenParserDedupeKeys = new Set<string>();
  // The generating model + thinking level for the current run. Updated
  // whenever a `[taskboard] Started ... model=` marker is seen so agent
  // outputs in the run carry that run's attribution — which is what makes
  // mid-task model switches (a continue / recovery run on a different
  // model) render correctly.
  let currentModel: string | null = null;
  let currentThinking: string | null = null;

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const range = rangeForGroup(group, indexByLine, ctx.source);
    const startLineIdx = range.start;

    // `[taskboard]` runtime markers carry the per-run model on the system
    // stream. Capture the model before the run switch so the run marker and
    // the run's agent outputs both see it, then drop the marker line itself —
    // it is run bookkeeping, not a chat message (the legacy
    // buildConversationTurns view filters it the same way).
    const marker = readTaskboardMarker(group);
    if (marker) {
      // A Started marker begins a distinct run.  Unlike an explicit model
      // change, omitted metadata here must not inherit the prior run's
      // attribution (otherwise a low/high chip can be shown for a run that
      // did not report a thinking level at all).
      currentModel = marker.model;
      currentThinking = marker.thinkingLevel;
    }

    const matchedRun = runByLineIndex.get(startLineIdx);
    if (matchedRun?.run && matchedRun.run.index !== currentRun?.run?.index) {
      currentRun = matchedRun;
      if (ctx.emitRunMarkers) {
        events.push(toRunMarker(matchedRun, range, currentModel, currentThinking));
      }
    }

    if (marker) {
      // Most `[taskboard]` markers are run bookkeeping and stay invisible,
      // but an operator-driven model change is a timeline fact the reader
      // should see — surface it as a status chip instead of dropping it.
      const change = readModelChangeMarker(group);
      if (change) {
        events.push({
          id: `${range.source}:${range.start}-${range.end}:model-change`,
          kind: 'system.status',
          timestamp: group.lines[0]?.timestamp ?? '',
          runId: currentRun?.run?.index,
          rawRange: range,
          severity: 'info',
          category: 'model-change',
          label: 'Model changed',
          explanation: `${modelChangeLabel(change.from)} → ${modelChangeLabel(change.to)}`
        });
        // Attribute subsequent outputs to the new model until the next run's
        // Started marker re-asserts it.
        if (change.to) currentModel = change.to === 'default' ? null : change.to;
      }
      continue;
    }

    // The agent's own task plan (`* Todo [status] title; …`, from Claude's
    // TodoWrite / Codex's update_plan) is a first-class row, not tool noise:
    // parse the latest snapshot into a plan.update event and never fold it
    // into a tool burst. Emitted before the burst logic so a todo group
    // starts its own row; the burst lookahead below also stops at todos.
    const planItems = readPlanUpdate(group);
    if (planItems) {
      events.push(
        toPlanUpdate(planItems, range, currentRun?.run?.index, group.lines[0]?.timestamp ?? '', currentModel, currentThinking)
      );
      continue;
    }

    // Contiguous tool / failed-tool groups collapse into a single ToolBurst
    // event so the chat does not paint a wall of chips. The window stops at
    // the first non-tool group; user / agent / orchestrator turns always
    // break a burst even when the agent immediately resumes tool calls
    // afterwards (the natural reading rhythm is tool burst → reply).
    const burstFamily = classifyToolGroup(group);
    if (burstFamily) {
      const burstGroups: { group: ActivityLogGroup; family: ToolFamily }[] = [
        { group, family: burstFamily }
      ];
      let lookahead = i + 1;
      while (lookahead < groups.length) {
        const next = groups[lookahead];
        const nextFamily = classifyToolGroup(next);
        // A todo group is a plan.update, not burst material — stop here so it
        // becomes its own row on the next iteration.
        if (!nextFamily || nextFamily === 'todo') break;
        burstGroups.push({ group: next, family: nextFamily });
        lookahead += 1;
      }
      const lastIdx = lookahead - 1;
      const lastRange = rangeForGroup(groups[lastIdx], indexByLine, ctx.source);
      const mergedRange: RawLineRange = {
        source: ctx.source,
        start: range.start,
        end: Math.max(range.end, lastRange.end)
      };
      events.push(
        toMergedToolBurst(burstGroups, mergedRange, currentRun?.run?.index, currentModel, currentThinking)
      );
      i = lastIdx;
      continue;
    }

    const ev = projectGroup(group, range, currentRun, seenParserDedupeKeys, currentModel, currentThinking);
    if (ev) events.push(...ev);
  }

  // Image artefacts and token metrics come from companion sources, not the
  // activity log itself, so they are appended after the line walk. They keep
  // a synthetic raw range that points at the start of the transcript so the
  // renderer can still link back to context.
  if (ctx.screenshots) {
    for (const shot of ctx.screenshots) events.push(toImageEvent(shot, ctx, lineNumbers));
  }
  if (ctx.tokenSummary) {
    events.push(toTaskTokenMetric(ctx.tokenSummary, ctx, lineNumbers));
  }
  if (currentRun?.run && ctx.tokenSummary) {
    // No-op placeholder: per-run token metrics get split out by a later job
    // when run-level token attribution lands in the backend response.
  }
  if (ctx.commits && ctx.commits.length > 0 && ctx.emitWorkbenchPreviews) {
    events.push(toGitPreview(ctx.commits, ctx, lineNumbers));
  }
  if (ctx.screenshots && ctx.screenshots.length > 0 && ctx.emitWorkbenchPreviews) {
    events.push(toVisualPreview(ctx.screenshots, ctx, lineNumbers));
  }
  if (ctx.task && ctx.emitRunMarkers) {
    events.push(toTaskMarker(ctx.task, ctx, lineNumbers));
  }
  if (ctx.emitWorkbenchSummary) {
    events.push(toWorkbenchSummary(events, ctx, lineNumbers));
  }
  if (ctx.emitDebugAggregate) {
    events.push(toWorkbenchDebug(events, ctx, lineNumbers));
  }
  if (ctx.emitTraceLink) {
    events.push(toTraceLink(ctx, lineNumbers));
  }
  return events;
}

// ──────────────────────────────────────────────────────────────────────────
// Group → event projection
// ──────────────────────────────────────────────────────────────────────────

function projectGroup(
  group: ActivityLogGroup,
  range: RawLineRange,
  currentRun: RunContext,
  seenParserDedupeKeys: Set<string>,
  model: string | null,
  thinkingLevel: string | null
): ConversationEvent[] | null {
  const firstLine = group.lines[0];
  if (!firstLine) return null;
  const ts = firstLine.timestamp;
  const baseId = `${range.source}:${range.start}-${range.end}`;
  const runId = currentRun?.run?.index;
  const normalizedBody = normalizeVisibleChatBody(group.lines);
  const visibleBody = normalizedBody.text;
  const diagnostics = normalizedBody.strippedEnvelopes.length > 0
    ? {
        rawBody: group.lines.map((line) => line.text ?? '').join('\n'),
        strippedEnvelopes: normalizedBody.strippedEnvelopes
      }
    : undefined;

  // User messages are always their own turn.
  if (firstLine.stream === 'user') {
    if (!visibleBody) return null;
    return [
      {
        id: `${baseId}:user`,
        kind: 'message.user',
        timestamp: ts,
        runId,
        rawRange: range,
        actor: 'You',
        body: visibleBody,
        diagnostics,
        target: extractUserTarget(firstLine.text)
      }
    ];
  }

  if (firstLine.stream === 'orchestrator') {
    // Do not resurrect an envelope-only frame through the raw-text fallback.
    // Recognized protocol markers such as [watchdog] remain in visibleBody and
    // continue through the structured classification below.
    if (!visibleBody) return null;
    const orchestratorText = visibleBody;
    // [watchdog] orchestrator messages get classified as supervisor.wait so
    // the chat row uses the correct family. The parser already filters them
    // out of conversation mode but the projection is the single source of
    // truth here, so it must classify on its own.
    if (/\[watchdog[^\]]*\]/i.test(orchestratorText)) {
      const wait = parseWatchdogText(orchestratorText);
      if (wait) {
        return [
          {
            id: `${baseId}:wait`,
            kind: 'supervisor.wait',
            timestamp: ts,
            runId,
            rawRange: range,
            severity: wait.state === 'killed' ? 'error' : wait.state === 'quiet' ? 'warn' : 'info',
            state: wait.state,
            quietSeconds: wait.quietSeconds,
            reason: wait.reason
          }
        ];
      }
    }

    const status = parseOrchestratorStatus(orchestratorText);
    if (status) {
      return [
        {
          id: `${baseId}:status`,
          kind: 'system.status',
          timestamp: ts,
          runId,
          rawRange: range,
          severity: status.severity,
          category: status.category,
          label: status.label,
          explanation: status.explanation,
          nextStep: status.nextStep
        }
      ];
    }

    // Heuristic / capture-fail / parser-warning all arrive as orchestrator
    // lines. Inspect the text to pick the right kind.
    if (/\[capture-fail\]/i.test(orchestratorText)) {
      const cliMatch = /from\s+(\w+)/i.exec(orchestratorText);
      return [
        {
          id: `${baseId}:capture-fail`,
          kind: 'system.captureFail',
          timestamp: ts,
          runId,
          rawRange: range,
          severity: 'warn',
          cliType: cliMatch?.[1] ?? 'unknown',
          fallback: 'rebuild from disk on next follow-up'
        }
      ];
    }
    if (/\[schema-drift\]/i.test(orchestratorText) || /report is unstructured/i.test(orchestratorText) || /failed to parse/i.test(orchestratorText)) {
      const dedupeKey = `schema-drift:${orchestratorText.trim()}`;
      if (seenParserDedupeKeys.has(dedupeKey)) return null;
      seenParserDedupeKeys.add(dedupeKey);
      const expectedRaw = /expected\s+([A-Za-z][\w-]*)/i.exec(orchestratorText)?.[1];
      const expected = expectedRaw
        ?? (/MetaCycle/i.test(orchestratorText) ? 'MetaCycleReport' : 'structured-report');
      return [
        {
          id: `${baseId}:schema-drift`,
          kind: 'system.schemaDrift',
          timestamp: ts,
          runId,
          rawRange: range,
          severity: 'warn',
          expectedSchema: expected,
          message: orchestratorText.trim(),
          recovery: 'Open raw report and regenerate',
          rawLink: { range, label: 'Open raw report' },
          collapsedByDefault: true
        }
      ];
    }
    if (/could not classify/i.test(orchestratorText) || /\[heuristic\]/i.test(orchestratorText)) {
      const dedupeKey = `heuristic:${orchestratorText.trim()}`;
      if (seenParserDedupeKeys.has(dedupeKey)) return null;
      seenParserDedupeKeys.add(dedupeKey);
      return [
        {
          id: `${baseId}:parser-warning`,
          kind: 'system.parserWarning',
          timestamp: ts,
          runId,
          rawRange: range,
          severity: 'warn',
          expectedKind: 'sentinel',
          message: orchestratorText.trim(),
          dedupeKey,
          collapsedByDefault: true
        }
      ];
    }
    if (/\[\[TASK_NEEDS_INPUT/i.test(orchestratorText) || /needs[- ]input/i.test(orchestratorText)) {
      const question = extractNeedsInputQuestion(orchestratorText);
      return [
        {
          id: `${baseId}:needs-input`,
          kind: 'agent.needsInput',
          timestamp: ts,
          runId,
          rawRange: range,
          severity: 'warn',
          question: question ?? orchestratorText.trim(),
          loopIndex: 0,
          loopLimit: 0,
          answerSource: null,
          nextAction: 'await-human'
        }
      ];
    }

    // Fall back to a generic orchestrator decision row.
    const reason = orchestratorText.replace(/^\s*\[[^\]]+\]\s*/, '').trim();
    const decisionType = (/^\s*\[([^\]]+)\]/.exec(orchestratorText)?.[1] ?? 'decision').toLowerCase();
    return [
      {
        id: `${baseId}:decision`,
        kind: 'decision.orchestrator',
        timestamp: ts,
        runId,
        rawRange: range,
        decisionType,
        reason,
        action: decisionType === 'reissue' ? 'reissue' : undefined
      }
    ];
  }

  if (firstLine.stream === 'supervisor') {
    if (!visibleBody) return null;
    return [
      {
        id: `${baseId}:supervisor`,
        kind: 'message.supervisor',
        timestamp: ts,
        runId,
        rawRange: range,
        severity: group.status === 'error' ? 'error' : 'info',
        actor: 'Supervisor',
        body: visibleBody,
        diagnostics
      }
    ];
  }

  // Terminal sentinels (`[[TASK_DONE]]`, `[[TASK_BLOCKED:…]]`, `[[TASK_NOOP]]`,
  // `[[TASK_NEEDS_INPUT:…]]`) are run-completion markers the agent prints on its
  // final line. They must never leak into the chat as raw text. Parse them into
  // a semantic result chip (or a needs-input prompt) and surface any
  // human-readable text the agent wrote alongside the marker as a normal agent
  // message so nothing is lost.
  const agentBody = joinGroupBody(group);
  const sentinel = parseTerminalSentinel(agentBody);
  if (sentinel) {
    const out: ConversationEvent[] = [];
    if (sentinel.strippedBody) {
      out.push({
        id: `${baseId}:agent`,
        kind: 'message.taskAgent',
        timestamp: ts,
        runId,
        model,
        thinkingLevel,
        rawRange: range,
        actor: 'Agent',
        body: sentinel.strippedBody
      });
    }
    if (sentinel.kind === 'needs-input') {
      out.push({
        id: `${baseId}:needs-input`,
        kind: 'agent.needsInput',
        timestamp: ts,
        runId,
        rawRange: range,
        severity: 'warn',
        question: sentinel.detail ?? 'The agent is waiting for input.',
        loopIndex: 0,
        loopLimit: 0,
        answerSource: null,
        nextAction: 'await-human'
      });
    } else {
      const meta = TERMINAL_RESULT_META[sentinel.kind];
      out.push({
        id: `${baseId}:result`,
        kind: 'system.status',
        timestamp: ts,
        runId,
        rawRange: range,
        severity: meta.severity,
        category: 'result',
        label: meta.label,
        explanation: sentinel.detail ?? meta.explanation,
        nextStep: meta.nextStep
      });
    }
    return out;
  }

  if (isCodexDebugGroup(group)) {
    const transcript = /exec transcript/i.test(group.title) || /text-mode stderr transcript/i.test(group.title);
    const failed = transcript && isCodexTranscriptFailure(group, currentRun);
    return [
      {
        id: `${baseId}:codex-status`,
        kind: 'system.status',
        timestamp: ts,
        runId,
        rawRange: range,
        severity: failed ? 'error' : 'info',
        category: failed ? 'cli-failure' : transcript ? 'codex-transcript' : 'codex',
        label: failed ? 'CLI failed' : transcript ? 'Codex transcript' : group.title.replace(/^Codex\s+/i, 'Codex '),
        explanation: failed ? codexTranscriptFailureExplanation(group, currentRun) : codexLifecycleExplanation(group.title),
        nextStep: (transcript || failed)
          ? 'Open raw transcript in Trace.'
          : 'No action needed; raw frame is available in Trace.'
      }
    ];
  }

  // Tool / tool-error groups never reach this branch: the main loop
  // collapses contiguous tool activity into a single merged ToolBurst
  // before delegating non-tool groups here. That keeps every burst in
  // the conversation a single dense row and lets the renderer summarise
  // multi-family activity without re-walking the event list.
  if (group.kind === 'error' || group.status === 'error') {
    const routerError = parseToolRouterError(joinGroupBody(group));
    if (routerError) {
      return [
        {
          id: `${baseId}:tool-router`,
          kind: 'system.parserWarning',
          timestamp: ts,
          runId,
          rawRange: range,
          severity: 'warn',
          expectedKind: 'tool-result',
          message: routerError,
          dedupeKey: `tool-router:${routerError}`,
          collapsedByDefault: true
        }
      ];
    }
    if (!visibleBody) return null;
    const firstLine = visibleBody.split(/\r?\n/)[0].trim();
    return [
      {
        id: `${baseId}:agent-error`,
        kind: 'system.status',
        timestamp: ts,
        runId,
        rawRange: range,
        severity: 'error',
        category: 'cli-failure',
        label: 'CLI failed',
        explanation: firstLine || visibleBody,
        nextStep: 'Open raw transcript in Trace.'
      }
    ];
  }

  // Default: a regular task-agent message turn.
  if (!visibleBody) return null;
  return [
    {
      id: `${baseId}:agent`,
      kind: 'message.taskAgent',
      timestamp: ts,
      runId,
      model,
      thinkingLevel,
      rawRange: range,
      actor: 'Agent',
      body: visibleBody,
      diagnostics
    }
  ];
}

// ──────────────────────────────────────────────────────────────────────────
// Tool burst summarisation
// ──────────────────────────────────────────────────────────────────────────

const TOOL_KINDS: readonly ActivityLogKind[] = ['read', 'search', 'command', 'edit', 'task', 'todo'];

function isToolKind(k: ActivityLogKind): k is Exclude<ToolFamily, 'other'> {
  return TOOL_KINDS.includes(k);
}

/**
 * Returns the tool family for a group that should fold into a contiguous
 * tool burst, or `null` when the group is not tool-like. The error case
 * exists because the activity-log parser collapses any failing action into
 * kind='error', erasing the original verb; we recover it from the raw
 * line text so a failed `Run npm test` still folds into the burst with
 * `failures + 1` instead of escaping as a generic agent error message.
 */
function classifyToolGroup(group: ActivityLogGroup): ToolFamily | null {
  if (isToolKind(group.kind)) return group.kind as ToolFamily;
  if (group.kind === 'error') {
    const firstLine = group.lines[0];
    if (!firstLine) return null;
    return recoverToolFamilyFromErrorLine(firstLine.text);
  }
  return null;
}

/**
 * If this group is a todo/plan group, parse its LATEST snapshot into plan
 * items; otherwise null. Claude re-emits the whole list on every change, so a
 * batched group carries several `* Todo …` lines — the last one wins.
 */
function readPlanUpdate(group: ActivityLogGroup): PlanItem[] | null {
  if (classifyToolGroup(group) !== 'todo') return null;
  let items: PlanItem[] | null = null;
  for (const line of group.lines) {
    const parsed = parseTodoLine(line.text ?? '');
    if (parsed) items = parsed;
  }
  return items;
}

/** Parse `* Todo [status] title; [status] title; …` into plan items. */
function parseTodoLine(text: string): PlanItem[] | null {
  // Marker (`*` action / `x` failed) is optional; the verb `Todo` is required.
  const m = /^[\sxX*]*Todo\b\s*(.*)$/.exec(text.trim());
  if (!m) return null;
  const body = m[1].trim();
  if (!body) return [];
  const items: PlanItem[] = [];
  for (const part of body.split(/;\s+/)) {
    const entry = part.trim();
    if (!entry) continue;
    const bracket = /^\[([^\]]*)\]\s*(.+)$/.exec(entry);
    const title = (bracket ? bracket[2] : entry).trim();
    if (!title) continue;
    const status = bracket ? normalizePlanStatus(bracket[1]) : 'pending';
    items.push({ id: planItemId(title), title, status });
  }
  return items;
}

/** Normalise a CLI-native status token onto the closed PlanItemStatus set. */
function normalizePlanStatus(raw: string): PlanItemStatus {
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (s === 'in_progress' || s === 'inprogress' || s === 'active' || s === 'running' || s === 'started') return 'in_progress';
  if (s === 'completed' || s === 'complete' || s === 'done' || s === 'finished') return 'completed';
  if (s === 'cancelled' || s === 'canceled' || s === 'skipped' || s === 'dropped') return 'cancelled';
  return 'pending';
}

/** Stable id from the title so an item keeps identity across snapshots. */
function planItemId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'item';
}

function toPlanUpdate(
  items: readonly PlanItem[],
  range: RawLineRange,
  runId: number | undefined,
  timestamp: string,
  model: string | null,
  thinkingLevel: string | null
): ConversationEvent {
  return {
    id: `${range.source}:${range.start}-${range.end}:plan`,
    kind: 'plan.update',
    timestamp,
    runId,
    model,
    thinkingLevel,
    rawRange: range,
    items
  };
}

function recoverToolFamilyFromErrorLine(text: string): ToolFamily | null {
  // Action lines are emitted as `<marker> <verb> ...`. The parser already
  // stripped the marker, but the original CliOutputLine still carries it.
  const m = /^[xX*]\s+(?<verb>Read|Search|Grep|Edit|Write|Run|Execute|Build|Check|Update|Apply|Move|Delete|Create|Task|Todo)\b/i.exec(text);
  if (!m) return null;
  const verb = m.groups!['verb'].toLowerCase();
  if (verb === 'read') return 'read';
  if (verb === 'search' || verb === 'grep') return 'search';
  if (verb === 'edit' || verb === 'write' || verb === 'create' || verb === 'delete' || verb === 'move' || verb === 'update' || verb === 'apply') return 'edit';
  if (verb === 'run' || verb === 'execute' || verb === 'build' || verb === 'check') return 'command';
  if (verb === 'task') return 'task';
  if (verb === 'todo') return 'todo';
  return null;
}

interface BurstMember {
  group: ActivityLogGroup;
  family: ToolFamily;
}

function toMergedToolBurst(
  members: readonly BurstMember[],
  range: RawLineRange,
  runId: number | undefined,
  model: string | null,
  thinkingLevel: string | null
) {
  const families: Partial<Record<ToolFamily, number>> = {};
  const samples: Record<string, string | undefined> = {};
  const files: string[] = [];
  const artifacts: string[] = [];
  const tests: { command: string; status: 'pass' | 'fail' | 'unknown' }[] = [];
  const commands: ToolCommandExecution[] = [];
  const allLines: CliOutputLine[] = [];

  let count = 0;
  let failures = 0;

  for (const { group, family } of members) {
    const batchSize = inferBatchSize(group);
    const isFailure = group.kind === 'error' || group.status === 'error';
    families[family] = (families[family] ?? 0) + batchSize;
    count += batchSize;
    if (isFailure) failures += batchSize;
    if (!samples[family]) {
      samples[family] = group.subtitle || stripBatchSuffix(group.title);
    }
    for (const path of collectFilePaths(group, family)) {
      if (!files.includes(path)) files.push(path);
      if (looksLikeArtifact(path) && !artifacts.includes(path)) {
        artifacts.push(path);
      }
    }
    if (family === 'command') {
      const test = detectTest(group);
      if (test) tests.push(test);
      const command = commandExecutionFromGroup(group);
      if (command) commands.push(command);
    }
    allLines.push(...group.lines);
  }

  // Tests sometimes appear as "run", "rerun", "passed in 320ms". Roll
  // multiple identical commands into a single test entry whose final
  // status is the latest non-unknown status seen, so a fail/retry/pass
  // pattern surfaces as one passing test rather than three rows.
  const collapsedTests = collapseTestsByCommand(tests);

  return {
    id: `${range.source}:${range.start}-${range.end}:tool`,
    kind: 'toolBurst' as const,
    timestamp: members[0].group.lines[0].timestamp,
    runId,
    model,
    thinkingLevel,
    rawRange: range,
    severity: failures > 0 ? ('error' as const) : ('info' as const),
    count,
    families,
    failures,
    durationMs: computeDurationMs(allLines),
    files: files.length > 0 ? files : undefined,
    artifacts: artifacts.length > 0 ? artifacts : undefined,
    tests: collapsedTests.length > 0 ? collapsedTests : undefined,
    commands: commands.length > 0 ? commands : undefined,
    samples,
    collapsedByDefault: true
  };
}

function isCodexDebugGroup(group: ActivityLogGroup): boolean {
  return group.kind === 'other' && /^Codex\b/i.test(group.title);
}

function codexLifecycleExplanation(title: string): string {
  const label = title.replace(/^Codex\s+/i, '').trim();
  if (/exec transcript/i.test(label) || /text-mode stderr transcript/i.test(label)) {
    return 'Codex captured a text-mode stderr transcript.';
  }
  if (/turn\.started/i.test(label)) return 'Codex started a model turn.';
  if (/turn\.completed/i.test(label)) return 'Codex completed the model turn.';
  if (/thread|session/i.test(label)) return 'Codex emitted session lifecycle metadata.';
  return 'Codex emitted a structured runtime frame.';
}

function isCodexTranscriptFailure(group: ActivityLogGroup, currentRun: RunContext): boolean {
  return group.lines.some((line) => isCodexTextModeTranscriptFailure(line.text))
    || currentRun.run?.status === 'failed'
    || (currentRun.run?.exitCode !== null
      && currentRun.run?.exitCode !== undefined
      && currentRun.run.exitCode !== 0);
}

function codexTranscriptFailureExplanation(group: ActivityLogGroup, currentRun: RunContext): string {
  for (const line of group.lines) {
    const text = line.text.trim();
    if (isCodexTextModeTranscriptFailure(text)) return text;
  }
  if (currentRun.run?.exitCode !== null && currentRun.run?.exitCode !== undefined) {
    return `Codex exited with code ${currentRun.run.exitCode}.`;
  }
  return 'Codex stderr transcript ended in a CLI failure.';
}

function parseToolRouterError(text: string): string | null {
  if (!/codex_core::tools::router/i.test(text)) return null;
  const exit = /Exit code:\s*(-?\d+)/i.exec(text)?.[1];
  return exit
    ? `Tool router reported exit code ${exit}.`
    : 'Tool router reported an execution error.';
}

interface ParsedStatus {
  category: string;
  label: string;
  explanation: string;
  nextStep?: string;
  severity: 'info' | 'warn' | 'error';
}

function parseOrchestratorStatus(text: string): ParsedStatus | null {
  const match = /^\s*\[([a-z0-9_.:-]+)\]\s*(.*)$/i.exec(text);
  if (!match) return null;
  const category = match[1].toLowerCase();
  const body = match[2].trim();
  switch (category) {
    case 'codex-silent-completion':
      return {
        category,
        label: 'Silent completion recovery',
        explanation: body || 'Codex stopped producing output after a final tool call, so the runner finalized the run through its recovery path.',
        nextStep: 'Review the result evidence; this is a recovery signal, not proof of completion.',
        severity: 'warn'
      };
    case 'watchdog':
    case 'watchdog-warning':
    case 'watchdog-timeout':
      return {
        category,
        label: 'Watchdog',
        explanation: body || 'The watchdog observed a quiet or stuck run.',
        nextStep: /kill|timeout/i.test(category + body) ? 'The runner will stop or escalate the run.' : 'Waiting for output or the timeout threshold.',
        severity: /timeout|kill|cancel/i.test(category + body) ? 'error' : 'warn'
      };
    case 'quarantined':
    case 'circuit-breaker':
      return {
        category,
        label: 'Circuit breaker',
        explanation: body || 'The runner stopped a repeated no-progress loop.',
        nextStep: 'Human review should inspect the repeated failure before rerunning.',
        severity: 'error'
      };
    case 'environment-blocker':
      return {
        category,
        label: 'Environment blocker',
        explanation: body || 'The local environment blocked the run.',
        nextStep: 'Fix the environment issue, then retry the task.',
        severity: 'error'
      };
    case 'worktree-containment':
      return {
        category,
        label: 'Worktree containment',
        explanation: body || 'The runner detected a worktree or path containment guard.',
        nextStep: 'Keep review inside the task worktree boundary.',
        severity: 'warn'
      };
    case 'recovery':
      // One calm line per recovery (crash / watchdog / host-restart /
      // system-sleep). The full rationale lives in the run/lifecycle
      // artifacts, so there is deliberately no nextStep and the severity stays
      // informational - it reads as a system decision, not an alarm.
      return {
        category,
        label: 'Recovery',
        explanation: body || 'The platform recovered an interrupted run.',
        severity: 'info'
      };
    default:
      return null;
  }
}

const COMMAND_SUMMARY_RE = /^\$\s+(?<command>.*?)\s*(?:\[(?<status>[^\]]+)\])?\s*(?:\[exit\s+(?<exit>-?\d+)\])?\s*$/i;
const SHELL_PROMPT_RE = /^\s*(?:PS[^>]*>|[$>#%])\s+/;

// The shell command is already shown as the dedicated input line. Many runners
// (e.g. codex `aggregated_output`) repeat that exact command as the first line
// of the captured output. Drop that leading echo so the command is presented
// exactly once. Only a single leading echo is removed, and only when it matches
// the command verbatim (optionally behind a shell prompt).
function stripLeadingCommandEcho(lines: readonly string[], command: string): string[] {
  const target = command.trim();
  if (!target) return [...lines];
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length) return [...lines];
  const candidate = lines[i].replace(SHELL_PROMPT_RE, '').trim();
  return candidate === target ? lines.slice(i + 1) : [...lines];
}

function commandExecutionFromGroup(group: ActivityLogGroup): ToolCommandExecution | null {
  const first = group.lines[0]?.text ?? '';
  const parsed = COMMAND_SUMMARY_RE.exec(first);
  const command = (parsed?.groups?.['command'] ?? group.title).trim();
  if (!command) return null;
  const statusRaw = (parsed?.groups?.['status'] ?? '').toLowerCase();
  const exitRaw = parsed?.groups?.['exit'];
  const exitCode = exitRaw === undefined ? null : Number(exitRaw);
  const outputLines = stripLeadingCommandEcho(
    group.lines.slice(parsed ? 1 : 0).map((l) => l.text ?? ''),
    command
  );
  return {
    command,
    status: normalizeCommandStatus(statusRaw, group.status, Number.isFinite(exitCode) ? exitCode : null),
    exitCode: Number.isFinite(exitCode) ? exitCode : null,
    output: outputLines.join('\n').trimEnd(),
    outputLineCount: outputLines.length,
    outputTruncated: false,
    hits: parseOutputHits(outputLines)
  };
}

function normalizeCommandStatus(
  status: string,
  groupStatus: ActivityLogGroup['status'],
  exitCode: number | null
): ToolCommandExecution['status'] {
  if (/progress|running|started/.test(status)) return 'running';
  if (/fail|error|cancel/.test(status) || groupStatus === 'error' || (exitCode !== null && exitCode !== 0)) return 'failed';
  if (/complete|success|done/.test(status) || exitCode === 0) return 'completed';
  return 'unknown';
}

const HIT_RE = /^(?<path>(?:[A-Za-z]:)?[^:\n]+?):(?<line>\d+)(?::(?<col>\d+))?:\s*(?<text>.*)$/;

function parseOutputHits(lines: readonly string[]): ToolOutputHit[] | undefined {
  const hits: ToolOutputHit[] = [];
  for (const raw of lines) {
    const match = HIT_RE.exec(raw.trim());
    if (!match?.groups) continue;
    const path = match.groups['path'].trim();
    if (!/[\\/]|[.][A-Za-z0-9]+$/.test(path)) continue;
    hits.push({
      path,
      line: Number(match.groups['line']),
      column: match.groups['col'] ? Number(match.groups['col']) : undefined,
      text: match.groups['text'] ?? ''
    });
    if (hits.length >= 40) break;
  }
  return hits.length > 0 ? hits : undefined;
}

function stripBatchSuffix(title: string): string {
  return title.replace(/\s*(?:×\d+|\(\d+\))\s*$/, '').trim();
}

/**
 * Pulls likely file paths out of a tool group. Read / search lines carry
 * the path in the title verb ("Read prompt.md") and again as the `|`
 * continuation. Edit groups put the path in the subtitle. Commands
 * generally do not name a file, so we leave their files alone.
 */
function collectFilePaths(group: ActivityLogGroup, family: ToolFamily): string[] {
  const out: string[] = [];
  const push = (raw: string | undefined): void => {
    if (!raw) return;
    const cleaned = raw.replace(/^[\s|`\\/_-]+/, '').trim();
    if (!cleaned) return;
    if (cleaned.length > 200) return;
    if (!/[./\\]/.test(cleaned)) return;
    if (!out.includes(cleaned)) out.push(cleaned);
  };
  if (family === 'read' || family === 'search' || family === 'edit') {
    push(group.subtitle);
    const verbMatch = /^(?:Read|Edit|Write|Create|Update|Apply|Delete|Move)\s+(.+)$/i.exec(stripBatchSuffix(group.title));
    if (verbMatch) push(verbMatch[1]);
  }
  for (const line of group.lines) {
    if (line.text && /^\s*\|/.test(line.text)) {
      push(line.text);
    }
  }
  return out;
}

function looksLikeArtifact(path: string): boolean {
  return /\.(png|jpg|jpeg|gif|svg|webp|pdf|html|json|md)$/i.test(path)
    || /(?:^|[\\/])(results|screenshots|artifacts|evidence)[\\/]/i.test(path);
}

const TEST_VERB_RE = /\b(test|spec|playwright|pytest|jest|vitest|mocha|xunit|dotnet test|npm (?:run )?test|npx playwright)\b/i;

function detectTest(group: ActivityLogGroup): { command: string; status: 'pass' | 'fail' | 'unknown' } | null {
  // The activity-log parser may have merged a fail / retry / pass run into
  // one "Commands ×N" batch group whose title no longer mentions "test".
  // Recover the test signal from any underlying line so the burst still
  // surfaces a Test rollup row in expanded mode.
  const actionLines = group.lines.filter((l) => /^\s*[xX*]\s+/.test(l.text));
  const looksLikeTest = TEST_VERB_RE.test(group.title)
    || actionLines.some((l) => TEST_VERB_RE.test(l.text));
  if (!looksLikeTest) return null;

  const sourceTitle = actionLines[0]?.text ?? group.title;
  const labelMatch = /^\s*[xX*]\s+(.+)$/.exec(sourceTitle);
  const baseTitle = stripBatchSuffix((labelMatch?.[1] ?? sourceTitle).trim());

  // Strip the "(shell)" trailer and the parser's "exited with error N" /
  // "failed" suffix so the de-dup key stays stable across pass/fail/retry
  // runs of the same command.
  const command = baseTitle
    .replace(/:\s*(?:exited with error\s*\d*|failed.*)$/i, '')
    .replace(/\s*\(shell\)\s*$/i, '')
    .trim();

  let status: 'pass' | 'fail' | 'unknown' = 'unknown';
  const isFailure = group.kind === 'error' || group.status === 'error'
    || /:\s*exited with error|\bfailed\b|\bFAIL\b/.test(group.title);
  const passEvidence = group.lines.some(
    (l) => /\bpassed\b|✓|\bsucceeded\b|\bOK\b|all tests pass/i.test(l.text)
  );
  if (passEvidence) status = 'pass';
  else if (isFailure) status = 'fail';
  return { command, status };
}

function collapseTestsByCommand(
  tests: readonly { command: string; status: 'pass' | 'fail' | 'unknown' }[]
): { command: string; status: 'pass' | 'fail' | 'unknown' }[] {
  const order: string[] = [];
  const map = new Map<string, 'pass' | 'fail' | 'unknown'>();
  for (const t of tests) {
    if (!map.has(t.command)) {
      order.push(t.command);
      map.set(t.command, t.status);
      continue;
    }
    const prev = map.get(t.command)!;
    // Latest non-unknown status wins so retry-then-pass surfaces as pass,
    // and pass-then-fail surfaces as fail.
    if (t.status !== 'unknown') map.set(t.command, t.status);
    else if (prev === 'unknown') map.set(t.command, t.status);
  }
  return order.map((cmd) => ({ command: cmd, status: map.get(cmd)! }));
}

function inferBatchSize(group: ActivityLogGroup): number {
  const m = /\s*(?:×(\d+)|\((\d+)\))\s*$/.exec(group.title);
  if (m) return Math.max(1, Number(m[1] ?? m[2]));
  return 1;
}

function computeDurationMs(lines: readonly CliOutputLine[]): number {
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const l of lines) {
    const t = Date.parse(l.timestamp);
    if (!Number.isFinite(t)) continue;
    if (t < first) first = t;
    if (t > last) last = t;
  }
  return Number.isFinite(first) && Number.isFinite(last) && last > first ? last - first : 0;
}

// ──────────────────────────────────────────────────────────────────────────
// Parsing helpers
// ──────────────────────────────────────────────────────────────────────────

interface WatchdogParse {
  state: 'quiet' | 'resumed' | 'killed';
  quietSeconds: number;
  reason?: string;
}

function parseWatchdogText(text: string): WatchdogParse | null {
  if (!/\[watchdog[^\]]*\]/i.test(text)) return null;
  if (/killed after|auto-cancelled after/i.test(text)) {
    const sec = /([0-9]+(?:\.[0-9]+)?)\s*(?:s|sec|seconds)/i.exec(text);
    return { state: 'killed', quietSeconds: sec ? Number(sec[1]) : 0, reason: text.trim() };
  }
  if (/resumed|streaming output again/i.test(text)) {
    return { state: 'resumed', quietSeconds: 0, reason: text.trim() };
  }
  if (/quiet|silent|no output for/i.test(text)) {
    const sec = /([0-9]+(?:\.[0-9]+)?)\s*(?:s|sec|seconds)/i.exec(text);
    return { state: 'quiet', quietSeconds: sec ? Number(sec[1]) : 0, reason: text.trim() };
  }
  return { state: 'quiet', quietSeconds: 0, reason: text.trim() };
}

function extractNeedsInputQuestion(text: string): string | null {
  const m = /\[\[TASK_NEEDS_INPUT:([^\]]+)\]\]/i.exec(text);
  if (m) return m[1].trim();
  const idx = text.toLowerCase().indexOf('needs-input');
  if (idx >= 0) return text.slice(idx + 'needs-input'.length).replace(/^[:\s-]+/, '').trim();
  return null;
}

type TerminalSentinelKind = 'done' | 'blocked' | 'noop' | 'needs-input';

interface TerminalSentinel {
  kind: TerminalSentinelKind;
  /** Reason / question payload from BLOCKED / NEEDS_INPUT, when present. */
  detail: string | null;
  /** The group body with every recognised sentinel token removed. */
  strippedBody: string;
}

const TERMINAL_SENTINEL_RE = /\[\[TASK_(DONE|NOOP|BLOCKED|NEEDS_INPUT)(?::([^\]]*))?\]\]/i;
const TERMINAL_SENTINEL_RE_GLOBAL = /\[\[TASK_(?:DONE|NOOP|BLOCKED|NEEDS_INPUT)(?::[^\]]*)?\]\]/gi;

const TERMINAL_RESULT_META: Record<
  'done' | 'blocked' | 'noop',
  { label: string; explanation: string; severity: ConversationEventSeverity; nextStep?: string }
> = {
  done: {
    label: 'Task complete',
    explanation: 'The agent reported the task finished successfully.',
    severity: 'info'
  },
  blocked: {
    label: 'Task blocked',
    explanation: 'The agent stopped and needs a human decision to continue.',
    severity: 'error',
    nextStep: 'Review the blocker, then re-queue or re-scope the task.'
  },
  noop: {
    label: 'No action needed',
    explanation: 'The agent determined no changes were required.',
    severity: 'info'
  }
};

/**
 * Detect a terminal sentinel anywhere in an agent group body and return the
 * classified outcome plus the body with every sentinel token stripped. Returns
 * `null` when no sentinel is present so the caller falls through to a regular
 * agent message turn.
 */
function parseTerminalSentinel(body: string): TerminalSentinel | null {
  const match = TERMINAL_SENTINEL_RE.exec(body);
  if (!match) return null;
  const token = match[1].toUpperCase();
  const kind: TerminalSentinelKind =
    token === 'DONE' ? 'done' : token === 'NOOP' ? 'noop' : token === 'BLOCKED' ? 'blocked' : 'needs-input';
  const detail = match[2]?.trim() || null;
  const strippedBody = body
    .replace(TERMINAL_SENTINEL_RE_GLOBAL, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { kind, detail, strippedBody };
}

function extractUserTarget(text: string): string | undefined {
  const m = /->\s*(?:task|job)\s+([\w/-]+)/i.exec(text);
  return m?.[1];
}

function joinGroupBody(group: ActivityLogGroup): string {
  return normalizeVisibleChatBody(group.lines).text || group.lines.map((l) => l.text).filter((t) => t !== undefined).join('\n').trim();
}

/**
 * Detect a `[taskboard]`-prefixed runtime marker on the system stream (CLI
 * started / exited). Returns `{ model }` for any such marker so the caller can
 * both update the run's model (from a `Started ... model=X` line) and drop the
 * marker line from the chat. Returns `null` for non-marker groups. The model
 * segment is only present on the Started line; exit markers yield `model: null`
 * and leave the running model unchanged.
 */
function readTaskboardMarker(
  group: ActivityLogGroup
): { model: string | null; thinkingLevel: string | null } | null {
  const first = group.lines[0];
  if (!first || first.stream !== 'system') return null;
  const text = first.text ?? '';
  if (!/^\s*\[taskboard\]/i.test(text)) return null;
  const m = /\bmodel=([^\s,]+)/i.exec(text);
  const think = /\bthinkingLevel=([^\s,]+)/i.exec(text);
  return { model: m ? m[1] : null, thinkingLevel: think ? think[1] : null };
}

/**
 * Detect the operator-driven model-change marker the taskboard backend
 * appends when the model is switched between runs
 * (`[taskboard] Model changed from=<id|default> to=<id|default>`). Distinct
 * from the `Started ... model=` attribution marker: this one is a
 * user-visible timeline fact and surfaces as a `system.status` chip.
 */
function readModelChangeMarker(
  group: ActivityLogGroup
): { from: string | null; to: string | null } | null {
  const first = group.lines[0];
  if (!first || first.stream !== 'system') return null;
  const text = first.text ?? '';
  if (!/^\s*\[taskboard\]\s+Model changed\b/i.test(text)) return null;
  const from = /\bfrom=([^\s,]+)/i.exec(text);
  const to = /\bto=([^\s,]+)/i.exec(text);
  return { from: from ? from[1] : null, to: to ? to[1] : null };
}

/** Human label for a model-change side: ids shorten, `default`/empty reads as CLI default. */
function modelChangeLabel(id: string | null): string {
  if (!id || id === 'default') return 'CLI default';
  return shortModelLabel(id);
}

// ──────────────────────────────────────────────────────────────────────────
// Range / run helpers
// ──────────────────────────────────────────────────────────────────────────

function numberLines(lines: readonly CliOutputLine[]): Map<CliOutputLine, number> {
  const map = new Map<CliOutputLine, number>();
  lines.forEach((l, i) => map.set(l, i + 1));
  return map;
}

function rangeForGroup(
  group: ActivityLogGroup,
  indexByLine: Map<CliOutputLine, number>,
  source: string
): RawLineRange {
  const indices: number[] = [];
  for (const l of group.lines) {
    const idx = indexByLine.get(l);
    if (idx !== undefined) indices.push(idx);
  }
  if (indices.length === 0) return { source, start: 1, end: 1 };
  indices.sort((a, b) => a - b);
  return { source, start: indices[0], end: indices[indices.length - 1] };
}

interface RunContext {
  run: RunInfoLite | null;
}

function pickInitialRun(timeline: RunTimelineLite | null): RunContext {
  if (!timeline || timeline.runs.length === 0) return { run: null };
  return { run: timeline.runs[0] };
}

function buildRunIndex(
  lines: readonly CliOutputLine[],
  timeline: RunTimelineLite | null
): Map<number, RunContext> {
  const map = new Map<number, RunContext>();
  if (!timeline || timeline.runs.length === 0) return map;
  for (const run of timeline.runs) {
    if (run.lineStart && run.lineStart > 0) {
      map.set(run.lineStart, { run });
    }
  }
  return map;
}

// ──────────────────────────────────────────────────────────────────────────
// Companion-evidence projection
// ──────────────────────────────────────────────────────────────────────────

function transcriptRange(ctx: ConversationProjectionContext, lineNumbers: Map<CliOutputLine, number>): RawLineRange {
  void lineNumbers;
  const len = ctx.lines.length;
  return { source: ctx.source, start: 1, end: Math.max(1, len) };
}

function toImageEvent(
  shot: ScreenshotEvidence,
  ctx: ConversationProjectionContext,
  lineNumbers: Map<CliOutputLine, number>
) {
  const range = transcriptRange(ctx, lineNumbers);
  return {
    id: `${range.source}:image:${shot.sourcePath}`,
    kind: 'artifact.image' as const,
    timestamp: shot.timestamp ?? ctx.lines[0]?.timestamp ?? new Date(0).toISOString(),
    rawRange: range,
    caption: shot.caption,
    sourcePath: shot.sourcePath,
    durablePath: shot.durablePath ?? null,
    sourceTool: shot.sourceTool,
    taskLink: shot.taskLink
  };
}

function toTaskTokenMetric(
  summary: TokenSummaryLite,
  ctx: ConversationProjectionContext,
  lineNumbers: Map<CliOutputLine, number>
) {
  const range = transcriptRange(ctx, lineNumbers);
  return {
    id: `${range.source}:metric:task-tokens`,
    kind: 'metric.token' as const,
    timestamp: summary.lastUpdate ?? ctx.lines[0]?.timestamp ?? new Date(0).toISOString(),
    rawRange: range,
    scope: 'task',
    inputTokens: summary.inputTokens,
    outputTokens: summary.outputTokens
  };
}

function toGitPreview(
  commits: readonly CommitEvidence[],
  ctx: ConversationProjectionContext,
  lineNumbers: Map<CliOutputLine, number>
) {
  const range = transcriptRange(ctx, lineNumbers);
  const files = commits.flatMap((c) => c.files);
  return {
    id: `${range.source}:workbench:git`,
    kind: 'workbench.gitPreview' as const,
    timestamp: commits[0]?.authorDateUtc ?? ctx.lines[0]?.timestamp ?? new Date(0).toISOString(),
    rawRange: range,
    files: files.map((f) => ({ status: f.status, path: f.path, added: f.added, removed: f.removed }))
  };
}

function toVisualPreview(
  shots: readonly ScreenshotEvidence[],
  ctx: ConversationProjectionContext,
  lineNumbers: Map<CliOutputLine, number>
) {
  const range = transcriptRange(ctx, lineNumbers);
  return {
    id: `${range.source}:workbench:visual`,
    kind: 'workbench.visualPreview' as const,
    timestamp: shots[0]?.timestamp ?? ctx.lines[0]?.timestamp ?? new Date(0).toISOString(),
    rawRange: range,
    images: shots.map((s) => ({ caption: s.caption, path: s.durablePath ?? s.sourcePath }))
  };
}

function toRunMarker(
  matched: RunContext,
  range: RawLineRange,
  model: string | null,
  thinkingLevel: string | null
) {
  const run = matched.run!;
  return {
    id: `${range.source}:run:${run.index}`,
    kind: 'runMarker' as const,
    timestamp: run.startedAt,
    runId: run.index,
    model,
    thinkingLevel,
    rawRange: range,
    marker: run.intent,
    cli: run.cli,
    sessionId: run.capturedSessionId,
    durationSeconds: run.durationSeconds,
    exitCode: run.exitCode,
    traceRange:
      run.lineStart && run.lineEnd
        ? { source: range.source, start: run.lineStart, end: run.lineEnd }
        : undefined
  };
}

function toTaskMarker(
  task: TaskInfoLite,
  ctx: ConversationProjectionContext,
  lineNumbers: Map<CliOutputLine, number>
) {
  const range = transcriptRange(ctx, lineNumbers);
  return {
    id: `${range.source}:task:${task.id}`,
    kind: 'taskMarker' as const,
    timestamp: task.lastActivity ?? task.createdAt ?? ctx.lines[0]?.timestamp ?? new Date(0).toISOString(),
    // `jobId` is a frozen wire-contract field name (TaskMarkerEvent); the broad
    // Job->Task field rename across the contract is a separate later task.
    jobId: task.id,
    rawRange: range,
    marker: task.state,
    lane: task.state,
    title: task.title,
    tokens: task.tokenSummary
      ? { inputTokens: task.tokenSummary.inputTokens, outputTokens: task.tokenSummary.outputTokens }
      : undefined
  };
}

function toWorkbenchSummary(
  collected: ConversationEvent[],
  ctx: ConversationProjectionContext,
  lineNumbers: Map<CliOutputLine, number>
) {
  const range = transcriptRange(ctx, lineNumbers);
  const aggregate = computeSummaryAggregate(collected, ctx);

  const headlineParts: string[] = [];
  if (aggregate.toolCallCount && aggregate.toolCallCount > 0) {
    headlineParts.push(`${aggregate.toolCallCount} tool call${aggregate.toolCallCount === 1 ? '' : 's'}`);
  }
  if (aggregate.toolFailureCount && aggregate.toolFailureCount > 0) {
    headlineParts.push(`${aggregate.toolFailureCount} failure${aggregate.toolFailureCount === 1 ? '' : 's'}`);
  }
  if (aggregate.commitCount && aggregate.commitCount > 0) {
    headlineParts.push(`${aggregate.commitCount} commit${aggregate.commitCount === 1 ? '' : 's'}`);
  }
  if (aggregate.filesChanged && aggregate.filesChanged > 0) {
    headlineParts.push(`${aggregate.filesChanged} file${aggregate.filesChanged === 1 ? '' : 's'}`);
  }
  if (aggregate.screenshotCount && aggregate.screenshotCount > 0) {
    headlineParts.push(`${aggregate.screenshotCount} screenshot${aggregate.screenshotCount === 1 ? '' : 's'}`);
  }
  if (aggregate.retryWarningCount && aggregate.retryWarningCount > 0) {
    headlineParts.push(`${aggregate.retryWarningCount} warning${aggregate.retryWarningCount === 1 ? '' : 's'}`);
  }
  if (aggregate.totalInputTokens || aggregate.totalOutputTokens) {
    const tokens = (aggregate.totalInputTokens ?? 0) + (aggregate.totalOutputTokens ?? 0);
    headlineParts.push(`${formatCount(tokens)} tokens`);
  }
  if (aggregate.latestResult) {
    headlineParts.push(aggregate.latestResult);
  }

  const bullets: string[] = [];
  if (aggregate.runCount && aggregate.runCount > 0) {
    const status = aggregate.latestRunStatus ? ` (${aggregate.latestRunStatus})` : '';
    bullets.push(`${aggregate.runCount} run${aggregate.runCount === 1 ? '' : 's'}${status}`);
  }
  if (aggregate.totalDurationSeconds && aggregate.totalDurationSeconds > 0) {
    bullets.push(`Duration: ${formatDurationSec(aggregate.totalDurationSeconds)}`);
  }
  if (aggregate.watchdogKilled) {
    bullets.push('Watchdog killed at least one run');
  }
  if (aggregate.state) {
    bullets.push(`Lane: ${aggregate.state}`);
  }

  return {
    id: `${range.source}:workbench:summary`,
    kind: 'workbench.summary' as const,
    timestamp: ctx.lines[0]?.timestamp ?? new Date(0).toISOString(),
    rawRange: range,
    headline: headlineParts.length > 0 ? headlineParts.join(' · ') : 'No activity yet',
    bullets: bullets.length > 0 ? bullets : undefined,
    aggregate
  };
}

function computeSummaryAggregate(
  collected: ConversationEvent[],
  ctx: ConversationProjectionContext
): WorkbenchSummaryAggregate {
  const toolBursts = collected.filter(
    (e): e is Extract<ConversationEvent, { kind: 'toolBurst' }> => e.kind === 'toolBurst'
  );
  const tokenMetrics = collected.filter(
    (e): e is Extract<ConversationEvent, { kind: 'metric.token' }> => e.kind === 'metric.token'
  );
  const taskScopedTokens = tokenMetrics.find((m) => m.scope === 'task') ?? tokenMetrics[0];
  const supervisorWaits = collected.filter(
    (e): e is Extract<ConversationEvent, { kind: 'supervisor.wait' }> => e.kind === 'supervisor.wait'
  );
  const parserWarnings = collected.filter((e) => e.kind === 'system.parserWarning');
  const captureFails = collected.filter((e) => e.kind === 'system.captureFail');
  const schemaDrifts = collected.filter((e) => e.kind === 'system.schemaDrift');
  const decisionRetries = collected.filter(
    (e): e is Extract<ConversationEvent, { kind: 'decision.orchestrator' }> =>
      e.kind === 'decision.orchestrator' && e.action === 'reissue'
  );

  const toolCallCount = toolBursts.reduce((acc, b) => acc + b.count, 0);
  const toolFailureCount = toolBursts.reduce((acc, b) => acc + b.failures, 0);
  const retryWarningCount =
    parserWarnings.length + captureFails.length + schemaDrifts.length + decisionRetries.length;

  const filesFromCommits = (ctx.commits ?? []).reduce(
    (acc, c) => acc + (c.files?.length ?? 0),
    0
  );

  const timeline = ctx.runTimeline ?? null;
  const latestRun = timeline && timeline.runs.length > 0
    ? timeline.runs[timeline.runs.length - 1]
    : null;

  const totalDurationSeconds = timeline
    ? timeline.runs.reduce((acc, r) => acc + (r.durationSeconds ?? 0), 0)
    : undefined;

  return {
    state: ctx.task?.state,
    runCount: timeline?.runCount,
    latestRunStatus: latestRun?.status,
    latestRunIntent: latestRun?.intent,
    totalDurationSeconds: totalDurationSeconds && totalDurationSeconds > 0 ? totalDurationSeconds : undefined,
    totalInputTokens: taskScopedTokens?.inputTokens,
    totalOutputTokens: taskScopedTokens?.outputTokens,
    toolCallCount,
    toolFailureCount,
    commitCount: ctx.commits?.length,
    filesChanged: filesFromCommits || undefined,
    screenshotCount: ctx.screenshots?.length,
    retryWarningCount: retryWarningCount > 0 ? retryWarningCount : undefined,
    watchdogKilled: supervisorWaits.some((w) => w.state === 'killed') || undefined,
    latestResult: ctx.latestResult
  };
}

function toWorkbenchDebug(
  collected: ConversationEvent[],
  ctx: ConversationProjectionContext,
  lineNumbers: Map<CliOutputLine, number>
) {
  const range = transcriptRange(ctx, lineNumbers);
  const messages = collected.filter(
    (e): e is Extract<ConversationEvent, { kind: `message.${string}` }> =>
      e.kind.startsWith('message.')
  );
  const toolBursts = collected.filter(
    (e): e is Extract<ConversationEvent, { kind: 'toolBurst' }> => e.kind === 'toolBurst'
  );
  const supervisorWaits = collected.filter(
    (e): e is Extract<ConversationEvent, { kind: 'supervisor.wait' }> => e.kind === 'supervisor.wait'
  );
  const tokenMetrics = collected.filter(
    (e): e is Extract<ConversationEvent, { kind: 'metric.token' }> => e.kind === 'metric.token'
  );

  const families: Partial<Record<ToolFamily, number>> = {};
  let toolFailures = 0;
  for (const burst of toolBursts) {
    toolFailures += burst.failures;
    for (const [family, count] of Object.entries(burst.families)) {
      families[family as ToolFamily] = (families[family as ToolFamily] ?? 0) + (count ?? 0);
    }
  }

  const timeline = ctx.runTimeline ?? null;
  const completedCount = timeline ? timeline.runs.filter((r) => r.status === 'completed').length : 0;
  const failedCount = timeline ? timeline.runs.filter((r) => r.status === 'failed').length : 0;
  const cancelledCount = timeline ? timeline.runs.filter((r) => r.status === 'cancelled').length : 0;

  const traceLinks: TraceLink[] = collected
    .filter((e) => e.kind === 'runMarker' || e.kind === 'toolBurst' || e.kind === 'system.parserWarning')
    .slice(0, 12)
    .map((e) => ({
      range: e.rawRange,
      label: `${e.kind} @ ${e.rawRange.start}-${e.rawRange.end}`
    }));

  return {
    id: `${range.source}:workbench:debug`,
    kind: 'workbench.debug' as const,
    timestamp: ctx.lines[0]?.timestamp ?? new Date(0).toISOString(),
    rawRange: range,
    actorCounts: {
      user: messages.filter((m) => m.kind === 'message.user').length,
      taskAgent: messages.filter((m) => m.kind === 'message.taskAgent').length,
      orchestrator: messages.filter((m) => m.kind === 'message.orchestrator').length,
      supervisor: messages.filter((m) => m.kind === 'message.supervisor').length,
      supportingAgent: messages.filter((m) => m.kind === 'message.supportingAgent').length
    },
    toolDensity: {
      total: toolBursts.reduce((acc, b) => acc + b.count, 0),
      failures: toolFailures,
      families
    },
    warningCounts: {
      supervisorAdvisories: messages.filter((m) => m.kind === 'message.supervisor').length,
      parserWarnings: collected.filter((e) => e.kind === 'system.parserWarning').length,
      captureFails: collected.filter((e) => e.kind === 'system.captureFail').length,
      schemaDrifts: collected.filter((e) => e.kind === 'system.schemaDrift').length,
      needsInputLoops: collected.filter((e) => e.kind === 'agent.needsInput').length,
      watchdogQuiet: supervisorWaits.filter((w) => w.state === 'quiet').length,
      watchdogKills: supervisorWaits.filter((w) => w.state === 'killed').length
    },
    tokenTotals: {
      inputTokens: tokenMetrics.reduce((acc, m) => acc + (m.inputTokens ?? 0), 0),
      outputTokens: tokenMetrics.reduce((acc, m) => acc + (m.outputTokens ?? 0), 0),
      reasoningTokens: tokenMetrics.reduce((acc, m) => acc + (m.reasoningTokens ?? 0), 0),
      cost: tokenMetrics.reduce((acc, m) => acc + (m.cost ?? 0), 0) || undefined
    },
    runStats: {
      runCount: timeline?.runCount ?? 0,
      completedCount,
      failedCount,
      cancelledCount
    },
    traceLinks
  };
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function formatDurationSec(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return min === 0 ? `${h}h` : `${h}h ${min}m`;
}

function toTraceLink(
  ctx: ConversationProjectionContext,
  lineNumbers: Map<CliOutputLine, number>
) {
  const range = transcriptRange(ctx, lineNumbers);
  return {
    id: `${range.source}:trace`,
    kind: 'traceLink' as const,
    timestamp: ctx.lines[0]?.timestamp ?? new Date(0).toISOString(),
    rawRange: range,
    target: 'raw-log',
    label: 'Open raw activity log',
    link: { range, label: 'Raw activity log' }
  };
}
