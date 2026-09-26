/**
 * Scenario catalog for the Conversation Lab — the single place to exercise the
 * library against every interesting transcript shape.
 *
 * Three scenario kinds:
 *
 * - `replay`  — a scripted `CliOutputLine[]` feed played through the SAME
 *   projection (`projectConversation`) the live workbench mode uses. This
 *   tests the real pipeline (activity-log parse → events → renderer), not
 *   hand-built events, and can be streamed line-by-line to simulate a live
 *   session without a backend.
 * - `live`    — a preset prompt for a REAL CLI run via the workbench host
 *   (`workbench/`, port 5055). Each preset is a reproducible starting point
 *   that provokes a specific event shape (tool rows, failures, todo plans).
 * - `events`  — hand-built `ConversationEvent[]` fixtures for renderer-only
 *   rows the projection cannot synthesize from short scripts (durable image
 *   artifacts, orchestrator decisions with retry budgets, token metrics).
 *
 * All replay scripts use a fixed timestamp base so replays are deterministic
 * across reloads.
 */

import type {
  ChatMessage,
  CliFrameSource,
  CliOutputLine,
  ConversationEvent,
  RunInfoLite,
  RunTimelineLite,
} from 'coding-agent-chat/core';
import {
  codexStructuredWorkPhaseFragment,
  codexTextModeStderrTranscriptFragment,
} from 'coding-agent-chat/core';

import {
  LAB_CONVERSATION_EVENTS,
  LAB_IMAGE_EVENTS,
  LAB_TURN_METADATA_MESSAGES,
  LAB_TURN_METADATA_EVENTS,
} from './lab-fixtures';

export type LabScenarioKind = 'events' | 'replay' | 'live';
export type LiveCliType = 'claude' | 'codex' | 'gemini';

interface LabScenarioBase {
  id: string;
  title: string;
  /** One or two sentences: what the scenario provokes and what to look for. */
  description: string;
}

/** Hand-built ConversationEvents rendered directly (renderer showcase). */
export interface EventsScenario extends LabScenarioBase {
  kind: 'events';
  events: readonly ConversationEvent[];
  /** Optional `<cac-chat>` turns for composer/message-specific fixtures. */
  messages?: readonly ChatMessage[];
}

/** Scripted raw lines replayed through `projectConversation`. */
export interface ReplayScenario extends LabScenarioBase {
  kind: 'replay';
  lines: readonly CliOutputLine[];
  /** Optional real run timeline so the projection emits run markers. */
  runTimeline?: RunTimelineLite;
  /** Exact raw-frame source for versioned protocol compatibility replays. */
  frameSource?: CliFrameSource;
}

/** Preset prompt for a real CLI session via the workbench host. */
export interface LiveScenario extends LabScenarioBase {
  kind: 'live';
  prompt: string;
  /** Preferred CLI; the user can still override it in the live bar. */
  cliType?: LiveCliType;
  /** Suggested follow-up message — exercises the resume-session chain. */
  followUp?: string;
}

export type LabScenario = EventsScenario | ReplayScenario | LiveScenario;

// ── Script builder ────────────────────────────────────────────────────────────

type ScriptEntry = readonly [text: string, stream?: string];

/** Fixed base (2026-07-01T09:00Z) + 2s steps: deterministic, ordered lines. */
function script(entries: readonly ScriptEntry[], stepSeconds = 2): CliOutputLine[] {
  const base = Date.UTC(2026, 6, 1, 9, 0, 0);
  return entries.map(([text, stream], index) => ({
    timestamp: new Date(base + index * stepSeconds * 1000).toISOString(),
    stream: stream ?? 'stdout',
    text,
  }));
}

function run(
  partial: Partial<RunInfoLite> & Pick<RunInfoLite, 'index' | 'lineStart' | 'lineEnd'>,
): RunInfoLite {
  return {
    intent: 'start',
    startedAt: '2026-07-01T09:00:00.000Z',
    status: 'completed',
    cli: 'claude',
    exitCode: 0,
    durationSeconds: 120,
    capturedSessionId: null,
    ...partial,
  };
}

// ── Replay scripts ────────────────────────────────────────────────────────────

const happyPathLines = script([
  ['Please add a dark/light toggle to the settings page and cover it with a spec.', 'user'],
  [
    '[taskboard] Started claude CLI (PID 4711), model=claude-sonnet-5, thinkingLevel=high, session=lab-sess-1',
    'system',
  ],
  ['I will first inspect the settings module and the existing theme service.'],
  ['* Read settings.component.ts'],
  ['  | src/app/settings/settings.component.ts'],
  ['* Read theme.service.ts'],
  ['  | src/app/theme/theme.service.ts'],
  ['* Search "data-studio-theme"'],
  ['  | 6 matches in 3 files'],
  ['* Edit settings.component.ts'],
  ['  | Added toggle and persistence'],
  ['* Run npx vitest run settings (shell)'],
  ['  | ✓ settings.component.spec.ts (4 Tests) 312ms'],
  [
    'The toggle is wired up: it flips `data-studio-theme` on the document root and persists the selection.',
  ],
  [''],
  ['All four tests pass.'],
]);

const testFailRetryLines = script([
  ['Run the Playwright suite and fix any failures.', 'user'],
  [
    '[taskboard] Started claude CLI (PID 4712), model=claude-sonnet-5, thinkingLevel=high',
    'system',
  ],
  ['* Run npx playwright test perf-frontend.spec.ts (shell)'],
  ['  | running playwright tests'],
  ['x Run npx playwright test perf-frontend.spec.ts (shell): exited with error 1'],
  ['  | grouped jobs poll took 11521 ms', 'stderr'],
  ['The polling timeout is too short. I will increase the budget and try again.'],
  ['* Edit perf-frontend.spec.ts'],
  ['  | Timeout 10s → 30s'],
  ['* Run npx playwright test perf-frontend.spec.ts (shell)'],
  ['  | passed in 320ms'],
  ['The suite passes: the failed run had an overly tight polling budget, not a product defect.'],
]);

const watchdogWaitLines = script(
  [
    ['Analyze the entire log directory and summarize the error categories.', 'user'],
    [
      '[taskboard] Started claude CLI (PID 4713), model=claude-sonnet-5, thinkingLevel=high',
      'system',
    ],
    ['* Read logs/2026-06-30.log'],
    ['  | 48,000 lines'],
    ['[watchdog] Agent has been quiet for 30s (budget 600s)', 'orchestrator'],
    ['[watchdog] Still silent at 60s', 'orchestrator'],
    ['[watchdog] Still silent at 90s', 'orchestrator'],
    ['[watchdog] Still silent at 120s', 'orchestrator'],
    ['[watchdog] Still silent at 150s', 'orchestrator'],
    ['[watchdog] Agent resumed streaming', 'orchestrator'],
    [
      'The long pause came from reading the 48k-line log. Here are the three dominant error categories.',
    ],
  ],
  30,
);

const watchdogKillLines = script([
  ['Start the migration and wait for the result.', 'user'],
  [
    '[taskboard] Started claude CLI (PID 4714), model=claude-sonnet-5, thinkingLevel=high',
    'system',
  ],
  ['* Run npm run migrate (shell)'],
  ['  | applying 14 migrations'],
  ['[watchdog] Agent has been quiet for 300s', 'orchestrator'],
  ['[watchdog] Killed after 600s of silence', 'orchestrator'],
  ['Run failed: watchdog kill after 600s of silence', 'stderr'],
]);

const needsInputLines = script([
  ['Build the recovery test for the CLI wrapper.', 'user'],
  [
    '[taskboard] Started claude CLI (PID 4715), model=claude-sonnet-5, thinkingLevel=high',
    'system',
  ],
  ['* Read cli-wrapper.ts'],
  ['  | src/runner/cli-wrapper.ts'],
  ['[[TASK_NEEDS_INPUT: which CLI should I target for the recovery test?]]', 'orchestrator'],
  ['[reissue] retrying because evidence was incomplete', 'orchestrator'],
]);

const modelSwitchLines = script([
  ['Implement the model badge in the conversation header.', 'user'],
  ['[taskboard] Started codex CLI (PID 11), model=gpt-5-codex, thinkingLevel=high', 'system'],
  ['First pass on the initial model — I am adding the badge markup.'],
  ['[taskboard] Started claude CLI (PID 22), model=claude-sonnet-5, thinkingLevel=high', 'system'],
  ['Recovery run on the switched model — the badge now reads the per-run model.'],
]);

const stderrCrashLines = script([
  ['Start the development server and check the home page.', 'user'],
  [
    '[taskboard] Started claude CLI (PID 4716), model=claude-sonnet-5, thinkingLevel=high',
    'system',
  ],
  ['* Run npm run dev (shell)'],
  ['  | starting dev server'],
  ["Error: Cannot find module 'esbuild'", 'stderr'],
  ['    at Function.Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)', 'stderr'],
  ['Run failed: process exited with code 1', 'stderr'],
]);

const codexTextModeStderrLines = codexTextModeStderrTranscriptFragment();
const codexStructuredWorkPhaseLines = codexStructuredWorkPhaseFragment();

const capturedCodexProtocolLines = script([
  ['{"type":"thread.started","thread_id":"<redacted>"}'],
  ['{"type":"turn.started"}'],
  [
    '{"type":"item.completed","item":{"id":"item-command","type":"command_execution","command":"npm test","aggregated_output":"PASS fixture spec","exit_code":0,"status":"completed"}}',
  ],
  [
    '{"type":"item.completed","item":{"id":"item-reasoning","type":"reasoning","text":"<sanitized>"}}',
  ],
  ['{"type":"output.truncated","reason":"capture_limit"}'],
  [
    '{"type":"item.completed","item":{"id":"item-message","type":"agent_message","text":"Codex fixture complete; the captured command passed."}}',
  ],
  ['{"type":"turn.completed"}'],
]);

const capturedClaudeProtocolLines = script([
  ['* Run npm test (shell)'],
  ['  | PASS fixture spec'],
  ['{"type":"system","subtype":"compact_boundary","compact_metadata":{}}'],
  ['Claude fixture complete; the tool result passed.'],
]);

const capturedGeminiProtocolLines = script([
  ['* Run npm test (shell)'],
  ['  | PASS fixture spec'],
  ['{"type":"truncation","reason":"output_limit"}'],
  ['Gemini fixture complete; normalized tool output passed.'],
]);

/** ~120 lines: 10 work blocks for scroll, fold, and performance checks. */
function longRunLines(): CliOutputLine[] {
  const entries: ScriptEntry[] = [
    ['Refactor all ten feature modules into standalone components.', 'user'],
    [
      '[taskboard] Started claude CLI (PID 4717), model=claude-sonnet-5, thinkingLevel=high',
      'system',
    ],
  ];
  for (let block = 1; block <= 10; block += 1) {
    entries.push(
      [`Module ${block}/10: migrate feature-${block}.`],
      [`* Read feature-${block}.module.ts`],
      [`  | src/app/feature-${block}/feature-${block}.module.ts`],
      [`* Search "feature-${block}" usages`],
      [`  | ${3 + (block % 4)} matches`],
      [`* Edit feature-${block}.component.ts`],
      ['  | standalone: true, imports moved'],
      [`* Run npx vitest run feature-${block} (shell)`],
      [`  | ✓ feature-${block}.component.spec.ts (${2 + (block % 3)} Tests)`],
      [`Module feature-${block} complete; tests pass.`],
      [''],
    );
  }
  entries.push(['All ten modules are standalone; the full suite passes.']);
  return script(entries, 1);
}

/** Claude-style TodoWrite plan: one list, re-emitted (a full snapshot) after
 *  each step, so the checklist ticks items off in place. The `* Todo …` lines
 *  match the workbench's PlanUpdated mapping, so replay == live. */
const todoPlanLines = script([
  ['Build a small CLI tool with argument parsing, help text, tests, and a README.', 'user'],
  [
    '[taskboard] Started claude CLI (PID 5001), model=claude-sonnet-5, thinkingLevel=high',
    'system',
  ],
  ['I will create a plan first and then work through it step by step.'],
  [
    '* Todo [in_progress] Implement argument parsing; [pending] Add help text; [pending] Write tests; [pending] Write README',
  ],
  ['* Edit src/cli.ts'],
  ['  | Added argv parsing with -h/--help flags'],
  [
    '* Todo [completed] Implement argument parsing; [in_progress] Add help text; [pending] Write tests; [pending] Write README',
  ],
  ['* Edit src/help.ts'],
  ['  | Help text with examples'],
  [
    '* Todo [completed] Implement argument parsing; [completed] Add help text; [in_progress] Write tests; [pending] Write README',
  ],
  ['* Run npx vitest run (shell)'],
  ['  | ✓ 6 tests passed'],
  [
    '* Todo [completed] Implement argument parsing; [completed] Add help text; [completed] Write tests; [in_progress] Write README',
  ],
  ['* Edit README.md'],
  ['  | Documented usage and examples'],
  [
    '* Todo [completed] Implement argument parsing; [completed] Add help text; [completed] Write tests; [completed] Write README',
  ],
  ['All four items are complete: parsing, help, passing tests, and the README.'],
]);

// ── Catalog ───────────────────────────────────────────────────────────────────

export const LAB_SCENARIOS: readonly LabScenario[] = [
  {
    id: 'showcase',
    kind: 'events',
    title: 'Showcase (Fixtures)',
    description:
      'Hand-built ConversationEvents: message groups, a tool burst, image artifacts (durable and scratch), an orchestrator decision with a retry budget, a token metric, and a run marker.',
    events: LAB_CONVERSATION_EVENTS,
  },
  {
    id: 'turn-metadata',
    kind: 'events',
    title: 'Turn metadata + complete message',
    description:
      'Complete short and long chat turns with immutable CLI, model, token, time, and run provenance. Details opens the quiet metadata view with copy actions.',
    events: LAB_TURN_METADATA_EVENTS,
    messages: LAB_TURN_METADATA_MESSAGES,
  },
  {
    id: 'images',
    kind: 'events',
    title: 'Images (screenshots + lightbox)',
    description:
      'Rendered image artifacts and an inline Markdown image. Click to open the lightbox; arrow keys navigate and Escape closes it. The CHAT_MEDIA_LIGHTBOX host seam provides the overlay.',
    events: LAB_IMAGE_EVENTS,
  },
  {
    id: 'happy-path',
    kind: 'replay',
    title: 'Feature task (happy path)',
    description:
      'User task → tool burst (Read/Search/Edit) → passing test run → agent summary. The [taskboard] marker sets the model and does not appear in the chat.',
    lines: happyPathLines,
    runTimeline: {
      runCount: 1,
      runs: [
        run({
          index: 1,
          lineStart: 1,
          lineEnd: happyPathLines.length,
          capturedSessionId: 'lab-sess-1',
          durationSeconds: 210,
        }),
      ],
    },
  },
  {
    id: 'test-fail-retry',
    kind: 'replay',
    title: 'Test failure + retry',
    description:
      'A failed test run (x line and stderr) followed by a fix and passing rerun. Exercises the test aggregate in the tool burst and the error row.',
    lines: testFailRetryLines,
  },
  {
    id: 'watchdog-wait',
    kind: 'replay',
    title: 'Watchdog: Wait-Loop',
    description:
      'Five quiet notices plus the resume event collapse into one default-closed wait group; expanding it shows all six events.',
    lines: watchdogWaitLines,
  },
  {
    id: 'watchdog-kill',
    kind: 'replay',
    title: 'Watchdog: kill after silence',
    description:
      'The run is killed after 600s of silence; the termination appears as an error row.',
    lines: watchdogKillLines,
  },
  {
    id: 'needs-input',
    kind: 'replay',
    title: 'Needs Input + Reissue',
    description:
      'The agent requests clarification with a NEEDS_INPUT sentinel and the orchestrator reissues the task. Exercises orchestrator row classification.',
    lines: needsInputLines,
  },
  {
    id: 'model-switch',
    kind: 'replay',
    title: 'Model switch across two runs',
    description:
      'Two runs use different models (Codex → Claude). Each agent message carries the model of its own run, and the run marker shows the switch.',
    lines: modelSwitchLines,
    runTimeline: {
      runCount: 2,
      runs: [
        run({
          index: 1,
          lineStart: 1,
          lineEnd: 3,
          cli: 'codex',
          capturedSessionId: 'sess-one',
          durationSeconds: 60,
        }),
        run({
          index: 2,
          intent: 'recovery',
          startedAt: '2026-07-01T09:00:06.000Z',
          lineStart: 4,
          lineEnd: 5,
          capturedSessionId: 'sess-two',
          durationSeconds: 45,
        }),
      ],
    },
  },
  {
    id: 'stderr-crash',
    kind: 'replay',
    title: 'Crash with stderr',
    description:
      'The process exits abruptly with a Node stack trace on stderr and "Run failed". Exercises error-row rendering without any successful context.',
    lines: stderrCrashLines,
  },
  {
    id: 'codex-stderr-transcript',
    kind: 'replay',
    title: 'Codex stderr transcript',
    description:
      'AGT-2176-shape: [runner]-Preface + Codex text-mode stderr transcript collapse into one trace row while the final stdout reply stays visible.',
    lines: codexTextModeStderrLines,
  },
  {
    id: 'capture-codex-0-146',
    kind: 'replay',
    title: 'Capture: Codex 0.146.x frames',
    description:
      'Versioned codex exec --json capture: lifecycle, command, reasoning, truncation, and agent-message frames rendered through the compatibility projection.',
    lines: capturedCodexProtocolLines,
    frameSource: { cli: 'codex', version: '0.146.0', transport: 'jsonl' },
  },
  {
    id: 'capture-claude-2-1',
    kind: 'replay',
    title: 'Capture: Claude 2.1.x frames',
    description:
      'Versioned stream-json capture after runner normalization, including tool output and a raw compact-boundary truncation marker.',
    lines: capturedClaudeProtocolLines,
    frameSource: { cli: 'claude', version: '2.1.220', transport: 'stream-json' },
  },
  {
    id: 'capture-gemini-0-49',
    kind: 'replay',
    title: 'Capture: Gemini 0.49.x frames',
    description:
      'Versioned runner-normalized Gemini capture with tool output, truncation evidence, and the visible assistant result.',
    lines: capturedGeminiProtocolLines,
    frameSource: {
      cli: 'gemini',
      version: '0.49.0',
      transport: 'runner-normalized-stream-json',
    },
  },
  {
    id: 'codex-work-phase',
    kind: 'replay',
    title: 'Codex work phase + todo',
    description:
      'CAC-25 before/after: twelve raw Codex JSONL frames (including file-change pairs and todo updates) project to one collapsed work phase, one living checklist, and one agent reply. Open Trace to compare the raw stream.',
    lines: codexStructuredWorkPhaseLines,
  },
  {
    id: 'long-run',
    kind: 'replay',
    title: 'Long run (10 blocks)',
    description:
      '~120 lines across ten work blocks for scrolling, the Jump to latest return, tool-burst folding, and rendering performance. Streamed playback simulates a real long session.',
    lines: longRunLines(),
  },
  {
    id: 'todo-plan',
    kind: 'replay',
    title: 'Todo plan (completed)',
    description:
      'Claude-style TodoWrite: a four-item plan is created and completed step by step. All snapshots coalesce into one checklist that updates in place; use streamed playback to watch it progress.',
    lines: todoPlanLines,
  },
  {
    id: 'live-smoke',
    kind: 'live',
    title: 'Live: smoke test',
    description:
      'A harmless prompt without tool use exercises the Workbench → CLI → SSE → projection chain. Expect a plain agent text response.',
    prompt:
      'Reply only with a short greeting and name your current working directory. Do not use tools.',
  },
  {
    id: 'live-write-file',
    kind: 'live',
    title: 'Live: create file',
    description:
      'The agent writes a file in the workbench sandbox. Expect a Write tool row in the burst and a short confirmation.',
    prompt:
      "Create a hello.md file in the working directory with exactly one line: 'Hello from the workbench sandbox'. Confirm briefly.",
    followUp: "Read hello.md and append a second line with today's date.",
  },
  {
    id: 'live-fail-command',
    kind: 'live',
    title: 'Live: failing command',
    description:
      'The agent deliberately runs a failing shell command. Expect a red x row for the tool failure and an explanation.',
    prompt:
      'Run the shell command `node -e "process.exit(1)"` in the working directory, report the exit code, and explain what happened in one sentence.',
  },
  {
    id: 'live-todo-plan',
    kind: 'live',
    title: 'Live: todo plan',
    description:
      'Forces Claude to use TodoWrite: the plan (PlanUpdated) renders as a live checklist that advances as items are completed.',
    prompt:
      'You must use your TodoWrite tool. Start with a four-item plan to create a small README.md in the working directory with a title, short description, usage example, and license line. Update the todo list after each item (in_progress → completed), then complete every item.',
  },
];

export function findScenario(id: string): LabScenario {
  return LAB_SCENARIOS.find((s) => s.id === id) ?? LAB_SCENARIOS[0];
}
