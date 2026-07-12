/**
 * Hand-built `ConversationEvent` fixtures for the Conversation Lab playground.
 *
 * The shapes mirror the fixture builders in
 * `projects/coding-agent-chat/conversation/src/conversation-view/conversation-view.component.spec.ts`
 * and cover the row kinds the demo wants on screen: message groups (user +
 * folded agent turns), a tool burst, run markers (a filtered `start` that
 * seeds the session id plus a terminal `complete`), an orchestrator decision,
 * and image artifacts (durable + scratch-only).
 */

import type {
  ArtifactImageEvent,
  ConversationEvent,
  MessageEvent,
  MetricTokenEvent,
  OrchestratorDecisionEvent,
  RawLineRange,
  RunMarkerEvent,
  SystemStatusEvent,
  TaskMarkerEvent,
  ToolBurstEvent,
} from 'coding-agent-chat/core';

import { LAB_IMAGE_CHART, LAB_IMAGE_SUNSET } from './lab-image-data';

const SOURCE = 'conversation-lab.log';

let lineCursor = 0;
function nextRange(span = 2): RawLineRange {
  const start = lineCursor + 1;
  lineCursor = start + span - 1;
  return { source: SOURCE, start, end: lineCursor };
}

/** Fixed base so the feed is deterministic across reloads. */
function at(minute: number, second = 0): string {
  return new Date(Date.UTC(2026, 6, 2, 9, minute, second)).toISOString();
}

const runStart: RunMarkerEvent = {
  id: 'run-1-start',
  kind: 'runMarker',
  timestamp: at(0),
  marker: 'start',
  runId: 1,
  cli: 'claude',
  model: 'claude-sonnet-5',
  sessionId: '0a1b2c3d-4e5f-6789-abcd-ef0123456789',
  rawRange: nextRange(),
};

const userAsk: MessageEvent = {
  id: 'msg-user-1',
  kind: 'message.user',
  timestamp: at(1),
  actor: 'You',
  body: 'Please add a dark/light theme toggle to the settings page and cover it with a spec.',
  rawRange: nextRange(),
};

const agentPickup: MessageEvent = {
  id: 'msg-agent-1',
  kind: 'message.taskAgent',
  timestamp: at(2),
  actor: 'Agent',
  body: 'Picking this up — reading the settings module and the existing theme service first.',
  rawRange: nextRange(),
};

const toolBurst: ToolBurstEvent = {
  id: 'burst-1',
  kind: 'toolBurst',
  timestamp: at(4),
  count: 7,
  families: { read: 3, search: 2, edit: 1, command: 1 },
  failures: 0,
  durationMs: 5200,
  // The showcase should exercise the OPEN state — it is the visually risky
  // one (details table, tests, command output) and stays visible on load.
  collapsedByDefault: false,
  files: ['src/app/settings/settings.component.ts', 'src/app/theme/theme.service.ts'],
  tests: [{ command: 'npx vitest run settings', status: 'pass' }],
  samples: {
    read: 'Read settings.component.ts',
    search: 'Grep "data-studio-theme"',
    edit: 'Edit theme.service.ts',
    command: 'npx vitest run settings',
  },
  commands: [
    {
      command: 'npx vitest run settings',
      status: 'completed',
      exitCode: 0,
      output: ' ✓ settings.component.spec.ts (4 tests) 312ms',
      outputLineCount: 1,
      outputTruncated: false,
    },
  ],
  rawRange: nextRange(14),
};

const agentProgress: MessageEvent = {
  id: 'msg-agent-2',
  kind: 'message.taskAgent',
  timestamp: at(5),
  actor: 'Agent',
  body: 'Toggle wired into the settings page; it flips `data-studio-theme` on the document root.',
  rawRange: nextRange(),
};

const agentTests: MessageEvent = {
  id: 'msg-agent-3',
  kind: 'message.taskAgent',
  timestamp: at(5, 30),
  actor: 'Agent',
  body: 'Spec added: toggling persists the choice and restores it on reload. All four tests pass.',
  rawRange: nextRange(),
};

const screenshotDurable: ArtifactImageEvent = {
  id: 'img-1',
  kind: 'artifact.image',
  timestamp: at(6),
  caption: 'Settings page with the new theme toggle (dark)',
  url: LAB_IMAGE_CHART,
  sourcePath: '/tmp/playwright/settings-toggle-dark.png',
  durablePath: 'results/settings-toggle-dark.png',
  sourceTool: 'playwright',
  rawRange: nextRange(),
};

const screenshotScratch: ArtifactImageEvent = {
  id: 'img-2',
  kind: 'artifact.image',
  timestamp: at(6, 20),
  caption: 'Light palette sanity check (uncurated)',
  url: LAB_IMAGE_SUNSET,
  sourcePath: '/tmp/playwright/settings-toggle-light.png',
  durablePath: null,
  sourceTool: 'playwright',
  rawRange: nextRange(),
};

const decision: OrchestratorDecisionEvent = {
  id: 'dec-1',
  kind: 'decision.orchestrator',
  timestamp: at(8),
  decisionType: 'reissue-open-items',
  reason: 'The toggle works, but the choice is not yet persisted across sessions.',
  evidence: 'localStorage is never written; a reload always falls back to dark.',
  action: 'reissue',
  retryBudget: { used: 1, max: 3 },
  rawRange: nextRange(5),
};

const agentFix: MessageEvent = {
  id: 'msg-agent-4',
  kind: 'message.taskAgent',
  timestamp: at(10),
  actor: 'Agent',
  body: 'Persistence added — the chosen theme is stored and re-applied before first paint.',
  rawRange: nextRange(),
};

const tokenMetric: MetricTokenEvent = {
  id: 'tok-1',
  kind: 'metric.token',
  timestamp: at(11),
  scope: 'run',
  inputTokens: 48213,
  outputTokens: 9127,
  rawRange: nextRange(1),
};

const runComplete: RunMarkerEvent = {
  id: 'run-1-complete',
  kind: 'runMarker',
  timestamp: at(12),
  marker: 'complete',
  runId: 1,
  cli: 'claude',
  model: 'claude-sonnet-5',
  durationSeconds: 720,
  exitCode: 0,
  tokens: { inputTokens: 48213, outputTokens: 9127 },
  rawRange: nextRange(1),
};

const agt2149RunStart: RunMarkerEvent = {
  id: 'agt-2149-run-start',
  kind: 'runMarker',
  timestamp: at(14),
  marker: 'start',
  runId: 2149,
  cli: 'codex',
  model: 'gpt-5.4-mini',
  thinkingLevel: 'high',
  sessionId: 'agt-2149-sess-01',
  rawRange: nextRange(1),
};

const agt2149UserTurn: MessageEvent = {
  id: 'agt-2149-user',
  kind: 'message.user',
  timestamp: at(14, 10),
  actor: 'You',
  body:
    'Replay AGT-2149 with structured warnings, turn metrics, and the mixed-height scroll fix check.',
  rawRange: nextRange(1),
};

const agt2149Recovery: MessageEvent = {
  id: 'agt-2149-agent-recovery',
  kind: 'message.taskAgent',
  timestamp: at(14, 20),
  actor: 'Agent',
  body: 'Quota recovery: the previous session dropped, so I resumed from the captured turn.',
  rawRange: nextRange(1),
};

const agt2149StreamingUpdate1: MessageEvent = {
  id: 'agt-2149-agent-stream-1',
  kind: 'message.taskAgent',
  timestamp: at(14, 30),
  actor: 'Agent',
  body: 'Streaming update 1/3: rebuilding the semantic result as structured diagnostics, not freeform noise.',
  rawRange: nextRange(1),
};

const agt2149StreamingUpdate2: MessageEvent = {
  id: 'agt-2149-agent-stream-2',
  kind: 'message.taskAgent',
  timestamp: at(14, 40),
  actor: 'Agent',
  body:
    'Streaming update 2/3: PATH warning, repeated plugin warnings, and the timeout detail should stay readable.',
  rawRange: nextRange(1),
};

const agt2149SemanticResult: MessageEvent = {
  id: 'agt-2149-agent-result',
  kind: 'message.taskAgent',
  timestamp: at(14, 50),
  actor: 'Agent',
  body:
    'Semantic result: the replay now separates warnings from metadata and preserves the final task state.\n\n' +
    '```json\n' +
    '{\n' +
    '  "scenario": "AGT-2149",\n' +
    '  "warnings": ["PATH", "plugin", "plugin"],\n' +
    '  "result": "semantic-pass"\n' +
    '}\n' +
    '```',
  rawRange: nextRange(3),
};

const agt2149TurnUsage: MetricTokenEvent = {
  id: 'agt-2149-turn-usage',
  kind: 'metric.token',
  timestamp: at(14, 55),
  scope: 'turn',
  inputTokens: 74192,
  outputTokens: 8331,
  reasoningTokens: 1024,
  rawRange: nextRange(1),
};

const agt2149TaskComplete: TaskMarkerEvent = {
  id: 'agt-2149-task-complete',
  kind: 'taskMarker',
  timestamp: at(14, 58),
  marker: 'complete',
  jobId: 'AGT-2149',
  lane: '3-progress',
  title: 'AGT-2149 replay',
  durationSeconds: 412,
  tokens: { inputTokens: 74192, outputTokens: 8331 },
  rawRange: nextRange(1),
};

const agt2149RunComplete: RunMarkerEvent = {
  id: 'agt-2149-run-complete',
  kind: 'runMarker',
  timestamp: at(15),
  marker: 'complete',
  runId: 2149,
  cli: 'codex',
  model: 'gpt-5.4-mini',
  durationSeconds: 412,
  exitCode: 0,
  tokens: { inputTokens: 74192, outputTokens: 8331 },
  sessionId: 'agt-2149-sess-01',
  rawRange: nextRange(1),
};

const agt2149PathWarning: SystemStatusEvent = {
  id: 'agt-2149-path-warning',
  kind: 'system.status',
  timestamp: at(14, 22),
  category: 'environment-blocker',
  label: 'PATH warning',
  explanation: '/opt/homebrew/bin was missing from PATH, so the shell fell back to a portable lookup.',
  severity: 'warn',
  rawRange: nextRange(1),
};

const agt2149PluginWarning1: SystemStatusEvent = {
  id: 'agt-2149-plugin-warning-1',
  kind: 'system.status',
  timestamp: at(14, 24),
  category: 'plugin-warning',
  label: 'Plugin warning',
  explanation: 'The sandbox plugin returned an empty payload on attempt 1/2.',
  severity: 'warn',
  rawRange: nextRange(1),
};

const agt2149PluginWarning2: SystemStatusEvent = {
  id: 'agt-2149-plugin-warning-2',
  kind: 'system.status',
  timestamp: at(14, 26),
  category: 'plugin-warning',
  label: 'Plugin warning',
  explanation: 'The sandbox plugin returned an empty payload again on attempt 2/2.',
  severity: 'warn',
  rawRange: nextRange(1),
};

const agt2149TimeoutDetail: SystemStatusEvent = {
  id: 'agt-2149-timeout',
  kind: 'system.status',
  timestamp: at(14, 52),
  category: 'watchdog-timeout',
  label: 'Timeout detail',
  explanation: 'Timed out waiting for the raw detail stream after 30s of silence.',
  nextStep: 'Retry the semantic pass or open the raw trace.',
  severity: 'error',
  rawRange: nextRange(1),
};

const agt2149RecoveryStatus: SystemStatusEvent = {
  id: 'agt-2149-recovery',
  kind: 'system.status',
  timestamp: at(14, 21),
  category: 'recovery',
  label: 'Recovery',
  explanation: 'Session loss was recovered by resuming from the captured turn history.',
  severity: 'info',
  rawRange: nextRange(1),
};

const agt2149ResultStatus: SystemStatusEvent = {
  id: 'agt-2149-result',
  kind: 'system.status',
  timestamp: at(14, 51),
  category: 'result',
  label: 'Semantic result',
  explanation: 'The structured output now reads as a clean pass instead of a noisy failure tail.',
  severity: 'info',
  rawRange: nextRange(1),
};

const agt2149SessionMeta: MessageEvent = {
  id: 'agt-2149-session-meta',
  kind: 'message.taskAgent',
  timestamp: at(14, 16),
  actor: 'Agent',
  body: 'Session metadata: session agt-2149-sess-01 · model gpt-5.4-mini · turn 2149.',
  rawRange: nextRange(1),
};

const agt2149Notes: MessageEvent = {
  id: 'agt-2149-notes',
  kind: 'message.taskAgent',
  timestamp: at(14, 44),
  actor: 'Agent',
  body:
    'Task aggregate: 1 run, 1 recovery, 2 plugin warnings, 1 PATH warning, and 82,523 tokens total.\n\n' +
    'The mixed-height replay is intentional: short warnings and a taller semantic result exercise the bottom lock.',
  rawRange: nextRange(3),
};

export const LAB_CONVERSATION_EVENTS: readonly ConversationEvent[] = [
  runStart,
  userAsk,
  agentPickup,
  toolBurst,
  agentProgress,
  agentTests,
  screenshotDurable,
  screenshotScratch,
  decision,
  agentFix,
  tokenMetric,
  runComplete,
];

export const LAB_AGT2149_EVENTS: readonly ConversationEvent[] = [
  agt2149RunStart,
  agt2149UserTurn,
  agt2149Recovery,
  agt2149RecoveryStatus,
  agt2149SessionMeta,
  agt2149PathWarning,
  agt2149PluginWarning1,
  agt2149PluginWarning2,
  agt2149StreamingUpdate1,
  agt2149StreamingUpdate2,
  agt2149ResultStatus,
  agt2149TimeoutDetail,
  agt2149SemanticResult,
  agt2149TurnUsage,
  agt2149Notes,
  agt2149TaskComplete,
  agt2149RunComplete,
];

/**
 * A focused image conversation: two rendered screenshot artifacts plus an
 * inline markdown image — all clickable to enlarge via the host lightbox.
 * Uses base64 PNG data URLs so it renders with no server.
 */
export const LAB_IMAGE_EVENTS: readonly ConversationEvent[] = [
  {
    id: 'imgsc-user',
    kind: 'message.user',
    timestamp: at(10),
    actor: 'You',
    body: 'Zeig mir das Dashboard und den Sonnenuntergangs-Verlauf als Screenshots.',
    rawRange: nextRange(),
  } as MessageEvent,
  {
    id: 'imgsc-agent-1',
    kind: 'message.taskAgent',
    timestamp: at(10, 12),
    actor: 'Agent',
    body: 'Klar — hier sind beide Screenshots. Klick auf ein Bild, um es zu vergrößern (Pfeiltasten blättern, Escape schließt).',
    rawRange: nextRange(),
  } as MessageEvent,
  {
    id: 'imgsc-1',
    kind: 'artifact.image',
    timestamp: at(10, 20),
    caption: 'Dashboard — Kennzahlen als Balkendiagramm',
    url: LAB_IMAGE_CHART,
    sourcePath: '/tmp/playwright/dashboard.png',
    durablePath: 'results/dashboard.png',
    sourceTool: 'playwright',
    rawRange: nextRange(),
  } as ArtifactImageEvent,
  {
    id: 'imgsc-2',
    kind: 'artifact.image',
    timestamp: at(10, 28),
    caption: 'Sonnenuntergangs-Verlauf',
    url: LAB_IMAGE_SUNSET,
    sourcePath: '/tmp/playwright/sunset.png',
    durablePath: null,
    sourceTool: 'screenshot',
    rawRange: nextRange(),
  } as ArtifactImageEvent,
  {
    id: 'imgsc-agent-2',
    kind: 'message.taskAgent',
    timestamp: at(10, 40),
    actor: 'Agent',
    body: `Und dasselbe Diagramm inline im Markdown-Text:\n\n![Dashboard-Diagramm](${LAB_IMAGE_CHART})\n\nAuch dieses Bild ist anklickbar.`,
    rawRange: nextRange(),
  } as MessageEvent,
];

let localTurnSeq = 0;

/** Build a new local user turn for composer submits (no backend involved). */
export function userTurnEvent(body: string): MessageEvent {
  localTurnSeq += 1;
  return {
    id: `local-user-${localTurnSeq}`,
    kind: 'message.user',
    timestamp: new Date().toISOString(),
    actor: 'You',
    body,
    rawRange: { source: 'conversation-lab.local', start: localTurnSeq, end: localTurnSeq },
  };
}
