/**
 * Narrative `ConversationEvent` fixtures for the website's live demo.
 *
 * One believable run, told end-to-end: the user reports a bug, the agent
 * plans, explores with tool bursts, lands the fix with a markdown + code
 * answer, the run completes and the orchestrator signs it off. Each step
 * carries a `holdMs` so the replay controller can stream the events onto
 * the page one after another.
 */

import type {
  ConversationEvent,
  MessageEvent,
  MetricTokenEvent,
  OrchestratorDecisionEvent,
  RawLineRange,
  RunMarkerEvent,
  SupervisorWaitEvent,
  ToolBurstEvent,
} from 'coding-agent-chat/core';

const SOURCE = 'website-demo.log';

let lineCursor = 0;
function nextRange(span = 2): RawLineRange {
  const start = lineCursor + 1;
  lineCursor = start + span - 1;
  return { source: SOURCE, start, end: lineCursor };
}

/** Fixed base timestamp so the feed is deterministic across reloads. */
function at(minute: number, second = 0): string {
  return new Date(Date.UTC(2026, 6, 2, 14, minute, second)).toISOString();
}

const runStart: RunMarkerEvent = {
  id: 'run-4-start',
  kind: 'runMarker',
  timestamp: at(0),
  marker: 'start',
  runId: 4,
  cli: 'claude',
  model: 'claude-fable-5',
  sessionId: '7f3d9a2c-51e8-4b06-9c44-d0a2b7e1f985',
  rawRange: nextRange(),
};

const userAsk: MessageEvent = {
  id: 'msg-user-1',
  kind: 'message.user',
  timestamp: at(1),
  actor: 'You',
  body: 'Search in the command palette misses typos — typing `fuzy` finds nothing. Add fuzzy matching and prove it with specs.',
  rawRange: nextRange(),
};

const agentPlan: MessageEvent = {
  id: 'msg-agent-1',
  kind: 'message.taskAgent',
  timestamp: at(2),
  actor: 'Agent',
  body: [
    'Picking this up. Plan:',
    '',
    '1. Read the current palette filter to see how matching works today.',
    '2. Replace exact `includes()` with a subsequence scorer that rewards word starts.',
    '3. Add specs for typo tolerance and result ranking.',
  ].join('\n'),
  rawRange: nextRange(4),
};

const exploreBurst: ToolBurstEvent = {
  id: 'burst-1',
  kind: 'toolBurst',
  timestamp: at(3, 30),
  count: 9,
  families: { read: 4, search: 3, command: 2 },
  failures: 0,
  durationMs: 6400,
  files: [
    'src/app/palette/palette.component.ts',
    'src/app/palette/palette-filter.ts',
    'src/app/palette/palette-filter.spec.ts',
  ],
  tests: [{ command: 'npx vitest run palette', status: 'pass' }],
  samples: {
    read: 'Read palette-filter.ts',
    search: 'Grep "includes(" src/app/palette',
    command: 'npx vitest run palette',
  },
  commands: [
    {
      command: 'npx vitest run palette',
      status: 'completed',
      exitCode: 0,
      output: ' ✓ palette-filter.spec.ts (6 tests) 214ms',
      outputLineCount: 1,
      outputTruncated: false,
    },
  ],
  rawRange: nextRange(12),
};

const agentFindings: MessageEvent = {
  id: 'msg-agent-2',
  kind: 'message.taskAgent',
  timestamp: at(4, 40),
  actor: 'Agent',
  body: 'Found it — the filter is a plain case-folded `includes()` in `palette-filter.ts`, so a single dropped letter kills the match. Swapping it for a subsequence scorer with word-start bonuses; existing six specs stay green as ranking guards.',
  rawRange: nextRange(),
};

const editBurst: ToolBurstEvent = {
  id: 'burst-2',
  kind: 'toolBurst',
  timestamp: at(6),
  count: 6,
  families: { edit: 3, read: 1, command: 2 },
  failures: 0,
  durationMs: 9100,
  files: ['src/app/palette/palette-filter.ts', 'src/app/palette/palette-filter.spec.ts'],
  tests: [{ command: 'npx vitest run palette', status: 'pass' }],
  samples: {
    edit: 'Edit palette-filter.ts',
    command: 'npx vitest run palette',
  },
  commands: [
    {
      command: 'npx vitest run palette',
      status: 'completed',
      exitCode: 0,
      output: ' ✓ palette-filter.spec.ts (11 tests) 268ms',
      outputLineCount: 1,
      outputTruncated: false,
    },
  ],
  rawRange: nextRange(10),
};

const agentAnswer: MessageEvent = {
  id: 'msg-agent-3',
  kind: 'message.taskAgent',
  timestamp: at(7, 20),
  actor: 'Agent',
  body: [
    'Done. The palette now matches subsequences and ranks word-start hits first — `fuzy` finds **Fuzzy search settings** as the top result.',
    '',
    '```ts',
    'export function scoreMatch(query: string, label: string): number {',
    '  let score = 0;',
    '  let cursor = 0;',
    '  for (const char of query.toLowerCase()) {',
    '    const hit = label.toLowerCase().indexOf(char, cursor);',
    '    if (hit < 0) return 0; // not a subsequence — no match',
    '    score += hit === cursor ? 3 : isWordStart(label, hit) ? 2 : 1;',
    '    cursor = hit + 1;',
    '  }',
    '  return score / label.length;',
    '}',
    '```',
    '',
    'Five new specs cover dropped letters, transpositions and ranking; all **11 pass**.',
  ].join('\n'),
  rawRange: nextRange(18),
};

const tokenMetric: MetricTokenEvent = {
  id: 'tok-1',
  kind: 'metric.token',
  timestamp: at(8),
  scope: 'run',
  inputTokens: 36420,
  outputTokens: 7180,
  rawRange: nextRange(1),
};

const runComplete: RunMarkerEvent = {
  id: 'run-4-complete',
  kind: 'runMarker',
  timestamp: at(8, 30),
  marker: 'complete',
  runId: 4,
  cli: 'claude',
  model: 'claude-fable-5',
  durationSeconds: 510,
  exitCode: 0,
  tokens: { inputTokens: 36420, outputTokens: 7180 },
  rawRange: nextRange(1),
};

const decision: OrchestratorDecisionEvent = {
  id: 'dec-1',
  kind: 'decision.orchestrator',
  timestamp: at(9),
  decisionType: 'decision',
  reason: 'Typo tolerance verified against the reported repro; ranking is spec-guarded.',
  evidence: '`fuzy` now returns "Fuzzy search settings" first; 11/11 palette specs pass.',
  action: 'complete',
  retryBudget: { used: 0, max: 3 },
  rawRange: nextRange(5),
};

/** One replay step: the event plus how long to hold before the next one. */
export interface ReplayStep {
  readonly event: ConversationEvent;
  readonly holdMs: number;
}

/**
 * Replay pacing: long-running agent work should *feel* like work, so text
 * events hold 1.5–3s before the next one lands. Only tool bursts may follow
 * their announcing message a bit faster (~1.4s) — that mirrors a real run,
 * where the agent starts its tools right after stating the plan.
 */
export const DEMO_REPLAY_STEPS: readonly ReplayStep[] = [
  { event: runStart, holdMs: 1500 },
  { event: userAsk, holdMs: 2600 },
  { event: agentPlan, holdMs: 1400 }, // tool burst follows quickly
  { event: exploreBurst, holdMs: 2800 },
  { event: agentFindings, holdMs: 1400 }, // tool burst follows quickly
  { event: editBurst, holdMs: 3000 },
  { event: agentAnswer, holdMs: 2400 },
  { event: tokenMetric, holdMs: 1500 },
  { event: runComplete, holdMs: 1800 },
  { event: decision, holdMs: 0 },
];

export const DEMO_CONVERSATION_EVENTS: readonly ConversationEvent[] = DEMO_REPLAY_STEPS.map(
  (step) => step.event,
);

let localTurnSeq = 0;

/** Build a local user turn for composer submits (no backend involved). */
export function userTurnEvent(body: string): MessageEvent {
  localTurnSeq += 1;
  return {
    id: `local-user-${localTurnSeq}`,
    kind: 'message.user',
    timestamp: new Date().toISOString(),
    actor: 'You',
    body,
    rawRange: { source: 'website-demo.local', start: localTurnSeq, end: localTurnSeq },
  };
}

/* ======================================================================== *
 * Second demo conversation — a different story for the right-hand frame:
 * a red CI pipeline, a failing command with stderr, a watchdog wait, an
 * orchestrator retry decision — and only then the green finish. Together
 * with the feature replay on the left it shows the grammar covers the
 * unhappy path too.
 * ======================================================================== */

const SOURCE_B = 'website-demo-ci.log';

let lineCursorB = 0;
function nextRangeB(span = 2): RawLineRange {
  const start = lineCursorB + 1;
  lineCursorB = start + span - 1;
  return { source: SOURCE_B, start, end: lineCursorB };
}

/** Fixed base timestamp for run B (later the same afternoon). */
function atB(minute: number, second = 0): string {
  return new Date(Date.UTC(2026, 6, 2, 16, minute, second)).toISOString();
}

const bRunStart: RunMarkerEvent = {
  id: 'run-7-start',
  kind: 'runMarker',
  timestamp: atB(0),
  marker: 'start',
  runId: 7,
  cli: 'claude',
  model: 'claude-fable-5',
  sessionId: 'a41c6f80-2b9d-47e3-8c15-6e9f0d3b7a24',
  rawRange: nextRangeB(),
};

const bUserAsk: MessageEvent = {
  id: 'b-msg-user-1',
  kind: 'message.user',
  timestamp: atB(1),
  actor: 'You',
  body: 'CI is red again: `checkout.spec.ts` times out on the Linux runner only — `TimeoutError: locator(\'#pay-now\') not found`. Find the real flake, no retry band-aids.',
  rawRange: nextRangeB(),
};

const bAgentPlan: MessageEvent = {
  id: 'b-msg-agent-1',
  kind: 'message.taskAgent',
  timestamp: atB(2),
  actor: 'Agent',
  body: [
    'On it. Suspicion: a race, not a missing element. Plan:',
    '',
    '1. Reproduce under the CI viewport and network throttle.',
    '2. Trace when `#pay-now` actually mounts vs. when the test clicks.',
    '3. Fix the root cause in the app or the wait condition — not the timeout.',
  ].join('\n'),
  rawRange: nextRangeB(4),
};

const bFailBurst: ToolBurstEvent = {
  id: 'b-burst-1',
  kind: 'toolBurst',
  timestamp: atB(3, 20),
  count: 7,
  families: { read: 2, command: 4, search: 1 },
  failures: 2,
  durationMs: 41800,
  files: ['e2e/checkout.spec.ts', 'src/app/checkout/payment-panel.ts'],
  tests: [{ command: 'npx playwright test checkout --project=linux-ci', status: 'fail' }],
  samples: {
    command: 'npx playwright test checkout --project=linux-ci',
    read: 'Read payment-panel.ts',
    search: 'Grep "pay-now" src e2e',
  },
  commands: [
    {
      command: 'npx playwright test checkout --project=linux-ci',
      status: 'failed',
      exitCode: 1,
      output: [
        '  1) checkout.spec.ts:31 › pays with saved card',
        "  TimeoutError: locator('#pay-now') not found after 15000ms",
        '  stderr | payment-panel: currency feed not ready, deferring render',
      ].join('\n'),
      outputLineCount: 3,
      outputTruncated: false,
    },
  ],
  rawRange: nextRangeB(14),
};

const bWatchdog: SupervisorWaitEvent = {
  id: 'b-wait-1',
  kind: 'supervisor.wait',
  timestamp: atB(5, 10),
  state: 'resumed',
  quietSeconds: 96,
  reason: 'agent quiet while the traced re-run was executing',
  rawRange: nextRangeB(1),
};

const bRetryDecision: OrchestratorDecisionEvent = {
  id: 'b-dec-1',
  kind: 'decision.orchestrator',
  timestamp: atB(6),
  decisionType: 'reissue',
  reason: 'Repro confirmed but the first fix attempt only raised the timeout — that treats the symptom.',
  evidence: 'stderr shows `currency feed not ready, deferring render`: the button mounts late, the test is right to fail.',
  action: 'reissue',
  retryBudget: { used: 1, max: 3 },
  rawRange: nextRangeB(5),
};

const bAgentFindings: MessageEvent = {
  id: 'b-msg-agent-2',
  kind: 'message.taskAgent',
  timestamp: atB(7),
  actor: 'Agent',
  body: 'Root cause found: `payment-panel` defers rendering until the currency feed resolves, and the Linux runner\'s cold cache makes that feed ~2s slower — the button genuinely is not there yet. Fixing the panel to render disabled-first, then enable on feed resolve. The spec keeps its strict timeout.',
  rawRange: nextRangeB(3),
};

const bFixBurst: ToolBurstEvent = {
  id: 'b-burst-2',
  kind: 'toolBurst',
  timestamp: atB(8, 30),
  count: 8,
  families: { edit: 3, read: 1, command: 4 },
  failures: 0,
  durationMs: 52400,
  files: ['src/app/checkout/payment-panel.ts', 'e2e/checkout.spec.ts'],
  tests: [{ command: 'npx playwright test checkout --repeat-each=25', status: 'pass' }],
  samples: {
    edit: 'Edit payment-panel.ts',
    command: 'npx playwright test checkout --repeat-each=25',
  },
  commands: [
    {
      command: 'npx playwright test checkout --repeat-each=25',
      status: 'completed',
      exitCode: 0,
      output: '  25 passed (3.1m) — zero flakes across repeats',
      outputLineCount: 1,
      outputTruncated: false,
    },
  ],
  rawRange: nextRangeB(11),
};

const bAgentAnswer: MessageEvent = {
  id: 'b-msg-agent-3',
  kind: 'message.taskAgent',
  timestamp: atB(10),
  actor: 'Agent',
  body: [
    'Fixed at the root — no timeout was touched. The pay button now renders **disabled-first** and flips on when the currency feed resolves:',
    '',
    '```ts',
    'readonly feed = inject(CurrencyFeed).rates; // resource',
    '',
    '// Render immediately; enable when rates resolve.',
    'readonly payDisabled = computed(() =>',
    '  this.feed.status() !== \'resolved\',',
    ');',
    '```',
    '',
    'The spec asserts the button exists *immediately* and becomes enabled within the old budget — `--repeat-each=25` runs green on the CI profile.',
  ].join('\n'),
  rawRange: nextRangeB(16),
};

const bRunComplete: RunMarkerEvent = {
  id: 'run-7-complete',
  kind: 'runMarker',
  timestamp: atB(11),
  marker: 'complete',
  runId: 7,
  cli: 'claude',
  model: 'claude-fable-5',
  durationSeconds: 660,
  exitCode: 0,
  tokens: { inputTokens: 48210, outputTokens: 9040 },
  rawRange: nextRangeB(1),
};

const bFinalDecision: OrchestratorDecisionEvent = {
  id: 'b-dec-2',
  kind: 'decision.orchestrator',
  timestamp: atB(11, 40),
  decisionType: 'decision',
  reason: 'Second attempt fixed the render race itself; the flake is gone under repeat pressure.',
  evidence: '25/25 repeated checkout runs pass on the linux-ci profile with the original 15s budget.',
  action: 'complete',
  retryBudget: { used: 1, max: 3 },
  rawRange: nextRangeB(5),
};

/**
 * The second demo replay: a debugging story with a failure, a watchdog wait
 * and an orchestrator retry before the fix. Same pacing rules as run A.
 */
export const DEMO_REPLAY_STEPS_B: readonly ReplayStep[] = [
  { event: bRunStart, holdMs: 1500 },
  { event: bUserAsk, holdMs: 2600 },
  { event: bAgentPlan, holdMs: 1400 }, // tool burst follows quickly
  { event: bFailBurst, holdMs: 2900 },
  { event: bWatchdog, holdMs: 2200 },
  { event: bRetryDecision, holdMs: 2600 },
  { event: bAgentFindings, holdMs: 1400 }, // tool burst follows quickly
  { event: bFixBurst, holdMs: 3000 },
  { event: bAgentAnswer, holdMs: 2400 },
  { event: bRunComplete, holdMs: 1600 },
  { event: bFinalDecision, holdMs: 0 },
];

/** The full transcript of run B (used by specs and as a static fallback). */
export const DEMO_CONVERSATION_B: readonly ConversationEvent[] = DEMO_REPLAY_STEPS_B.map(
  (step) => step.event,
);

/* ======================================================================== *
 * Scripted composer replies — a submit in the "try it" frame streams back
 * a clearly-labelled Demo Agent turn (plan → tool burst → markdown answer
 * that quotes the visitor's text). Purely local; no backend involved.
 * ======================================================================== */

/** One streamed step of a scripted reply: the event plus the pause before it. */
export interface DemoResponseStep {
  readonly event: ConversationEvent;
  /** Milliseconds to wait before this event appears (1.5–3s pacing). */
  readonly delayMs: number;
}

const DEMO_AGENT = 'Demo Agent';

/** Compact single-line quote of the visitor's text for reply bodies. */
function quoteUserText(text: string, max = 96): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

interface DemoResponseTemplate {
  plan(quoted: string): string;
  burst(): Omit<ToolBurstEvent, 'id' | 'timestamp' | 'rawRange' | 'kind'>;
  answer(quoted: string): string;
}

const RESPONSE_TEMPLATES: readonly DemoResponseTemplate[] = [
  {
    // The builder: has a hunch, is right, is a little smug about it.
    plan: (q) =>
      `“${q}” — love it. I have a hunch where this lives; give me a second to confirm before I touch anything.`,
    burst: () => ({
      count: 7,
      families: { read: 3, search: 3, edit: 1 },
      failures: 0,
      durationMs: 4200,
      files: ['src/app/feature/feature-flags.ts', 'src/app/feature/feature-flags.spec.ts'],
      tests: [{ command: 'npx vitest run flags', status: 'pass' }],
      samples: { read: 'Read feature-flags.ts', search: 'Grep "TODO(2024)" src/app' },
    }),
    answer: (q) =>
      [
        `Called it — **“${q}”** lived exactly where I thought, right next to a TODO from 2024. Landed:`,
        '',
        '- `feature-flags.ts` got a real implementation instead of the TODO',
        '- one new spec pins the edge case (`npx vitest run flags` → **green**)',
        '- zero public-API churn — your reviewers will be pleasantly bored',
        '',
        'On a real backend I would push a branch and open the PR now. *(This one is scripted — the page has no repo to break.)*',
      ].join('\n'),
  },
  {
    // The careful one: reproduce first, edit second, gloat never (well, a bit).
    plan: (q) =>
      `“${q}” — bold. Rule one applies: reproduce it before fixing it. Future-us always thanks past-us for this.`,
    burst: () => ({
      count: 9,
      families: { command: 4, read: 3, edit: 2 },
      failures: 1,
      durationMs: 8100,
      files: ['src/app/core/request.pipe.ts', 'src/app/core/request.pipe.spec.ts'],
      tests: [{ command: 'npx vitest run core --repeat-each=5', status: 'pass' }],
      samples: {
        command: 'npx vitest run core --repeat-each=5',
        edit: 'Edit request.pipe.ts',
      },
    }),
    answer: (q) =>
      [
        `Reproduced **“${q}”** on the second try (that red ✗ in the burst above was the repro — on purpose).`,
        '',
        '```diff',
        '- return cache.get(key) ?? compute(input);',
        '+ return cache.get(key) ?? cache.set(key, compute(input)); // actually cache it',
        '```',
        '',
        'The fix is one line; the confidence came from `--repeat-each=5` staying green. Classic.',
      ].join('\n'),
  },
  {
    // The speed-runner: terse, fast, quietly proud of the timer.
    plan: (q) => `“${q}”? Say less. Timer starts now. ⏱`,
    burst: () => ({
      count: 5,
      families: { search: 1, read: 1, edit: 2, command: 1 },
      failures: 0,
      durationMs: 3100,
      files: ['src/app/ui/toolbar.ts'],
      tests: [{ command: 'npx vitest run ui', status: 'pass' }],
      samples: { edit: 'Edit toolbar.ts', command: 'npx vitest run ui' },
    }),
    answer: (q) =>
      [
        `**“${q}”** — done in one pass. Three files read, twelve lines changed, suite green on the first run. Personal best for today.`,
        '',
        '> Real deployments stream this from *your* runner — I am just the demo with good reflexes.',
      ].join('\n'),
  },
];

let demoResponseSeq = 0;

/** Build the timed, scripted Demo Agent reply for one composer submit. */
export function demoAgentResponseSteps(userText: string): readonly DemoResponseStep[] {
  demoResponseSeq += 1;
  const seq = demoResponseSeq;
  const template = RESPONSE_TEMPLATES[(seq - 1) % RESPONSE_TEMPLATES.length];
  const quoted = quoteUserText(userText);
  const stamp = () => new Date().toISOString();
  const range = (n: number): RawLineRange => ({
    source: 'website-demo.scripted',
    start: seq * 100 + n,
    end: seq * 100 + n,
  });

  const plan: MessageEvent = {
    id: `demo-reply-${seq}-plan`,
    kind: 'message.taskAgent',
    timestamp: stamp(),
    actor: DEMO_AGENT,
    body: template.plan(quoted),
    rawRange: range(1),
  };
  const burst: ToolBurstEvent = {
    id: `demo-reply-${seq}-burst`,
    kind: 'toolBurst',
    timestamp: stamp(),
    ...template.burst(),
    rawRange: range(2),
  };
  const answer: MessageEvent = {
    id: `demo-reply-${seq}-answer`,
    kind: 'message.taskAgent',
    timestamp: stamp(),
    actor: DEMO_AGENT,
    body: template.answer(quoted),
    rawRange: range(3),
  };

  // Same pacing rules as the replays: thinking gaps run 1.5–3s; the tool
  // burst follows its announcing plan message slightly faster.
  return [
    { event: plan, delayMs: 1800 },
    { event: burst, delayMs: 1600 },
    { event: answer, delayMs: 2800 },
  ];
}
