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
