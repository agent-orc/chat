/**
 * Fixture fragments for the next-gen chat projection.
 *
 * These are not full job logs. They are small, deterministic Activity Log
 * snippets distilled from the real fixtures listed in
 * `docs/mockups/chat-window-next-gen/activity-log-edge-cases.md` so the
 * projection's classification can be unit tested without dragging an entire
 * job folder into the test runner.
 *
 * Each helper returns plain `CliOutputLine[]` so the projection can be fed
 * the same way a host would feed it.
 */

import type {
  CliOutputLine,
  RunInfoLite,
  RunTimelineLite,
  TokenSummaryLite
} from './projection-inputs';

let TS_COUNTER = 0;
function ts(offsetSec = 0): string {
  // Anchor everything at 2026-05-05T12:00:00Z and walk forward; tests can
  // assert on timestamp ordering without flake.
  const base = Date.UTC(2026, 4, 5, 12, 0, 0);
  return new Date(base + (offsetSec + (TS_COUNTER += 1)) * 1000).toISOString();
}

function line(text: string, stream = 'stdout'): CliOutputLine {
  return { timestamp: ts(), stream, text };
}

export function resetFixtureClock(): void {
  TS_COUNTER = 0;
}

/** User asks a question. */
export function userMessageFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [line('Please add a feature flag for NextGenChat.', 'user')];
}

/** A run of read / search / edit calls — the v6 "tool burst" canonical case. */
export function toolBurstFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('* Read prompt.md'),
    line('  | prompt.md'),
    line('* Read status.md'),
    line('  | status.md'),
    line('* Read activity-log.parser.ts'),
    line('  | frontend/src/app/components/activity-log.parser.ts'),
    line('* Search "needsInput"'),
    line('  | needle'),
    line('* Edit feature-flags.service.ts'),
    line('  | feature-flags.service.ts')
  ];
}

/** A standalone agent prose turn (no tool noise). */
export function agentTextFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('I will add a Frontend:NextGenChat flag and the projection scaffold next.'),
    line(''),
    line('After that the host inventory document follows.')
  ];
}

/**
 * Realistic transport-envelope samples from Agent Studio / orchestrator chat.
 * The body is still the user-visible answer, but the first line carries a
 * timestamp + speaker prefix that the parser must strip before rendering.
 */
export function envelopePrefixedReplyFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('2026-07-01 09:00 Supervisor: Keep the clean prose and hide the transport frame.'),
    line('2026-07-01 09:00 Orchestrator: The word Supervisor is part of the answer here, not a prefix.'),
    line('The word Supervisor is part of the answer here, not a prefix.'),
  ];
}

/**
 * Envelope-style streaming boundaries: the first chunk is only the frame, the
 * second chunk carries the visible payload, and a fenced code block must stay
 * untouched.
 */
export function envelopeStreamingBoundaryFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('2026-07-01 09:00 Supervisor:'),
    line('Proceed with the parser normalization.'),
    line(''),
    line('```markdown'),
    line('Supervisor: this is code, so it must stay verbatim.'),
    line('2026-07-01 09:00 Orchestrator: keep this timestamp in code too.'),
    line('```'),
  ];
}

/**
 * AGT-2176-shaped Codex text-mode run: a stderr transcript with a banner,
 * echoed prompt, reasoning / tool text, a compact TypeScript + JSDoc source
 * dump, a token count, and the final stdout answer that must remain in the
 * visible chat turn.
 */
export function codexTextModeStderrTranscriptFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('[runner] spawning codex exec system marker', 'system'),
    line('OpenAI Codex v0.144.1', 'stderr'),
    line('Prompt: collapse the stderr transcript into trace-only evidence.', 'stderr'),
    line('Reasoning: keep technical execution out of task-agent Markdown.', 'stderr'),
    line('Tool: read projects/coding-agent-chat/core/src/conversation-projection.ts', 'stderr'),
    line('export function projectConversation(): string {', 'stderr'),
    line("  return 'Codex transcript stays out of Markdown.';", 'stderr'),
    line('}', 'stderr'),
    line('/**', 'stderr'),
    line(' * Preserve the stdout reply while collapsing Codex stderr noise.', 'stderr'),
    line(' * JSDoc bullets must stay technical, not turn into chat prose.', 'stderr'),
    line(' */', 'stderr'),
    line('* 10,975 contiguous stderr lines', 'stderr'),
    line('* final token count: 12,345 tokens', 'stderr'),
    line('The stdout reply is still the visible answer, and it appears in the correct turn.', 'stdout')
  ];
}

/** Codex stderr run that ended in a real CLI failure instead of a reply. */
export function codexTextModeStderrFailureFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('[runner] spawning codex exec system marker', 'system'),
    line('OpenAI Codex v0.144.1', 'stderr'),
    line('Prompt: collapse the stderr transcript into trace-only evidence.', 'stderr'),
    line('Reasoning: keep technical execution out of task-agent Markdown.', 'stderr'),
    line('Tool: read projects/coding-agent-chat/core/src/conversation-projection.ts', 'stderr'),
    line('/**', 'stderr'),
    line(' * Preserve the stdout reply while collapsing Codex stderr noise.', 'stderr'),
    line(' */', 'stderr'),
    line('Run failed: process exited with code 1', 'stderr')
  ];
}

/** Orchestrator decides to reissue the task. */
export function orchestratorReissueFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [line('[reissue] retrying because evidence was incomplete', 'orchestrator')];
}

/** Watchdog detects a quiet window then notes the agent resumed. */
export function watchdogQuietResumeFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('[watchdog] Agent has been quiet for 47s', 'orchestrator'),
    line('[watchdog] Agent resumed streaming', 'orchestrator')
  ];
}

/** Watchdog kills the agent after a long silence. */
export function watchdogKillFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [line('[watchdog] Killed after 600s of silence', 'orchestrator')];
}

/** Heuristic: orchestrator could not classify the agent reply. */
export function heuristicWarningFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line("[heuristic] Could not classify the agent's reply; defaulting to noop", 'orchestrator')
  ];
}

/** Capture-fail: no claude session id was harvested for this run. */
export function captureFailFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('[capture-fail] No claude session id from claude this run; next follow-up will rebuild from disk', 'orchestrator')
  ];
}

/** Agent emits a NEEDS_INPUT sentinel that the orchestrator picks up. */
export function needsInputLoopFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('[[TASK_NEEDS_INPUT: which CLI should I target for the recovery test?]]', 'orchestrator')
  ];
}

/** Image artefact: agent attaches a screenshot path. */
export function imageArtifactFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('* Write results/01-empty-state.png'),
    line('  | results/01-empty-state.png')
  ];
}

/** Supervisor advisory row at high severity. */
export function supervisorAdvisoryFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [line('Job is approaching its retry budget (high)', 'supervisor')];
}

/**
 * Watchdog wait loop: agent goes quiet, watchdog repeats the warning, the
 * agent eventually resumes streaming. This is the v6 "wait loop" canonical
 * case from `activity-log-edge-cases.md`.
 */
export function waitLoopFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('[watchdog] Agent has been quiet for 30s', 'orchestrator'),
    line('[watchdog] Still silent at 60s', 'orchestrator'),
    line('[watchdog] Still silent at 120s', 'orchestrator'),
    line('[watchdog] Agent resumed streaming', 'orchestrator')
  ];
}

/**
 * Token spike: orchestrator and supporting-agent calls land near each other
 * with conspicuously high usage. The fixture exposes the lines plus an
 * accompanying `TaskTokenSummary` companion the projection can read.
 */
export function tokenSpikeFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('Continue with the long synthesis pass.', 'user'),
    line('Synthesizing the meta-cycle report...'),
    line('  | walking 30k lines of evidence')
  ];
}

export function tokenSpikeSummary(): TokenSummaryLite {
  return {
    inputTokens: 280_000,
    outputTokens: 14_500,
    lastUpdate: '2026-05-05T12:05:00Z'
  };
}

/**
 * Schema drift: orchestrator (or meta-cycle hosted service) reports that a
 * structured Markdown / JSON report could not be parsed. The projection
 * raises a `system.schemaDrift` event, not a generic parser warning.
 */
export function schemaDriftFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('[schema-drift] Failed to parse expected MetaCycleReport.json: missing recommendations[]', 'orchestrator')
  ];
}

/**
 * A failing test followed by a passing retry. This stresses the tool-burst
 * `tests` aggregate (one failure, then one pass) plus the failure flag
 * surfacing into the workbench summary.
 */
export function testFailRetryFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('* Run npx playwright test perf-frontend.spec.ts (shell)'),
    line('  | running playwright tests'),
    line('x Run npx playwright test perf-frontend.spec.ts (shell): exited with error 1'),
    line('  | grouped jobs poll took 11521 ms', 'stderr'),
    line('* Run npx playwright test perf-frontend.spec.ts (shell)'),
    line('  | rerunning after fix'),
    line('* Run npx playwright test perf-frontend.spec.ts (shell)'),
    line('  | passed in 320ms')
  ];
}

/**
 * A `[taskboard] Started ... model=` runtime marker on the system stream
 * followed by an agent prose turn. This is the canonical per-output model
 * source: the marker sets the run's generating model and is itself dropped
 * from the chat (run bookkeeping, not a message), so the agent turn carries
 * `model` while no fabricated row appears for the marker.
 */
export function taskboardStartedFragment(model: string = 'claude-opus-4-7'): CliOutputLine[] {
  resetFixtureClock();
  return [
    line(
      `[taskboard] Started claude CLI (PID 4242), model=${model}, thinkingLevel=high, session=sess-abc`,
      'system'
    ),
    line('Implementing the model badge now.')
  ];
}

/**
 * Two consecutive runs whose `[taskboard] Started` markers name *different*
 * models — the "Modelle wechseln innerhalb eines Tasks" case. Each run's
 * agent output must carry its own run's model, never one global value.
 */
export function modelSwitchFragment(
  first: string = 'gpt-5-codex',
  second: string = 'claude-opus-4-7'
): CliOutputLine[] {
  resetFixtureClock();
  return [
    line(`[taskboard] Started codex CLI (PID 11), model=${first}, thinkingLevel=high`, 'system'),
    line('First run reply on the initial model.'),
    line(`[taskboard] Started claude CLI (PID 22), model=${second}, thinkingLevel=high`, 'system'),
    line('Recovery run reply on the switched model.')
  ];
}

/**
 * Run timeline matching {@link modelSwitchFragment}: two runs whose
 * `lineStart` boundaries align with the two `[taskboard]` markers so the
 * projection emits a `runMarker` (carrying the switched model) on the
 * second run's transition.
 */
export function runTimelineForModelSwitch(): RunTimelineLite {
  const run1: RunInfoLite = {
    index: 1,
    intent: 'start',
    startedAt: '2026-05-05T12:00:00Z',
    status: 'completed',
    cli: 'codex',
    exitCode: 0,
    durationSeconds: 60,
    capturedSessionId: 'sess-one',
    lineStart: 1,
    lineEnd: 2
  };
  const run2: RunInfoLite = {
    ...run1,
    index: 2,
    intent: 'recovery',
    startedAt: '2026-05-05T12:01:30Z',
    cli: 'claude',
    capturedSessionId: 'sess-two',
    lineStart: 3,
    lineEnd: 4
  };
  return {
    runCount: 2,
    runs: [run1, run2]
  };
}

/** Composite sample mixing user → tools → agent with a watchdog quiet event. */
export function compositeFragment(): CliOutputLine[] {
  resetFixtureClock();
  return [
    line('Continue the implementation', 'user'),
    line('* Read AGENTS.md'),
    line('  | AGENTS.md'),
    line('* Edit feature-flags.service.ts'),
    line('  | feature-flags.service.ts'),
    line('[watchdog] Agent has been quiet for 30s', 'orchestrator'),
    line('Adding the projection module now.'),
    line('')
  ];
}

/**
 * A minimal run timeline matching the composite fragment so projection tests
 * can assert that `runMarker` events fire on transitions.
 */
export function runTimelineForComposite(): RunTimelineLite {
  const run: RunInfoLite = {
    index: 1,
    intent: 'continue',
    startedAt: '2026-05-05T12:00:00Z',
    status: 'completed',
    cli: 'claude',
    exitCode: 0,
    durationSeconds: 120,
    capturedSessionId: 'sess-abc',
    lineStart: 1,
    lineEnd: 7
  };
  return {
    runCount: 1,
    runs: [run]
  };
}
