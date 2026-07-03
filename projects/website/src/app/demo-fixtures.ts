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
  ToolBurstEvent,
} from '@coding-agent/chat/core';

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

export const DEMO_REPLAY_STEPS: readonly ReplayStep[] = [
  { event: runStart, holdMs: 700 },
  { event: userAsk, holdMs: 1500 },
  { event: agentPlan, holdMs: 1700 },
  { event: exploreBurst, holdMs: 1900 },
  { event: agentFindings, holdMs: 1700 },
  { event: editBurst, holdMs: 1900 },
  { event: agentAnswer, holdMs: 2400 },
  { event: tokenMetric, holdMs: 900 },
  { event: runComplete, holdMs: 1100 },
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
