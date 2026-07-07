/**
 * Data for the entry-point explorer in the docs section: seven tabs, each
 * pairing a copy-paste snippet with a LIVE rendering of the same thing, so
 * "what do I get from this import?" is answered by looking, not imagining.
 * The fixtures are deliberately tiny — three events, a few markdown lines —
 * so each panel reads in one glance.
 */

import type {
  ConversationEvent,
  MessageEvent,
  RawLineRange,
  ToolBurstEvent,
} from 'coding-agent-chat/core';

export type EntryPointKey =
  | 'core'
  | 'markdown'
  | 'conversation'
  | 'composer'
  | 'history'
  | 'shared'
  | 'theme';

export interface EntryPointTab {
  readonly key: EntryPointKey;
  /** The import path, shown as the tab label. */
  readonly label: string;
  /** Three-word orientation under the label. */
  readonly hint: string;
}

export const ENTRY_POINT_TABS: readonly EntryPointTab[] = [
  { key: 'core', label: 'core', hint: 'the wire contract' },
  { key: 'markdown', label: 'markdown', hint: 'agent text, rendered' },
  { key: 'conversation', label: 'conversation', hint: 'the event stream view' },
  { key: 'composer', label: 'composer', hint: 'the input surface' },
  { key: 'history', label: 'history', hint: 'searchable past runs' },
  { key: 'shared', label: 'shared', hint: 'tooltips & lightbox' },
  { key: 'theme', label: 'theme', hint: 'one CSS file' },
];

const SOURCE = 'explorer.log';
let lineCursor = 0;
function nextRange(span = 2): RawLineRange {
  const start = lineCursor + 1;
  lineCursor = start + span - 1;
  return { source: SOURCE, start, end: lineCursor };
}

/** Fixed timestamps — the prerendered page must be deterministic. */
function at(second: number): string {
  return new Date(Date.UTC(2026, 6, 3, 11, 0, second)).toISOString();
}

const exUser: MessageEvent = {
  id: 'ex-user',
  kind: 'message.user',
  timestamp: at(0),
  actor: 'You',
  body: 'The date formatter breaks on 29 Feb — fix it and add a spec.',
  rawRange: nextRange(),
};

const exBurst: ToolBurstEvent = {
  id: 'ex-burst',
  kind: 'toolBurst',
  timestamp: at(20),
  count: 5,
  families: { read: 2, edit: 2, command: 1 },
  failures: 0,
  durationMs: 5200,
  files: ['src/dates/format.ts', 'src/dates/format.spec.ts'],
  tests: [{ command: 'npx vitest run dates', status: 'pass' }],
  samples: { edit: 'Edit format.ts', command: 'npx vitest run dates' },
  rawRange: nextRange(6),
};

const exAnswer: MessageEvent = {
  id: 'ex-answer',
  kind: 'message.taskAgent',
  timestamp: at(50),
  actor: 'Agent',
  body: [
    'Fixed — the formatter used `getYear() % 4` for leap years; it now delegates to `Intl`:',
    '',
    '```ts',
    'const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });',
    'return fmt.format(date); // 29 Feb 2024 ✓',
    '```',
    '',
    'Two new specs cover the leap-day and the `1900` century case — **7/7 pass**.',
  ].join('\n'),
  rawRange: nextRange(10),
};

/** The explorer's shared three-event exchange (conversation + core tabs). */
export const EXPLORER_EVENTS: readonly ConversationEvent[] = [exUser, exBurst, exAnswer];

/** The tool burst above, verbatim as it crosses the wire (core tab). */
export const EXPLORER_EVENT_JSON: string = JSON.stringify(exBurst, null, 2);

/** Markdown sample for the markdown tab — bold, inline code, highlighted fence. */
export const EXPLORER_MARKDOWN: string = [
  'Root cause found in `format.ts` — **leap years were hand-rolled**:',
  '',
  '```ts',
  'const isLeap = (y: number) =>',
  '  (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;',
  '```',
  '',
  '> Every `hljs-*` token colour above flips with the theme.',
].join('\n');

/** Copy-paste snippet per tab. */
export const EXPLORER_SNIPPETS: Record<EntryPointKey, { code: string; label: string }> = {
  core: {
    label: 'zero Angular — runs in Node, tests, your backend',
    code: [
      "import { projectConversation } from 'coding-agent-chat/core';",
      "import type { ConversationEvent } from 'coding-agent-chat/core';",
      '',
      'const events: ConversationEvent[] = JSON.parse(feed); // wire JSON below ↓',
      'const items = projectConversation(events); // grouped, folded, render-ready',
    ].join('\n'),
  },
  markdown: {
    label: 'component template',
    code: '<cac-markdown [source]="agentAnswer" />',
  },
  conversation: {
    label: 'component template',
    code: '<cac-conversation-view [events]="events" [isRunning]="running" />',
  },
  composer: {
    label: 'component template',
    code: [
      '<cac-chat placeholder="Ask the agent…"',
      '          (submitMessage)="backend.send($event.text)" />',
    ].join('\n'),
  },
  history: {
    label: 'component template + data seam',
    code: [
      '<cac-project-chat-list project="my-app" />',
      '',
      '// app.config.ts — where the data comes from:',
      '{ provide: PROJECT_CHAT_DATA_SOURCE, useClass: MyHttpChatSource }',
    ].join('\n'),
  },
  shared: {
    label: 'directives',
    code: [
      '<button cacTooltip="Re-runs the failing spec">Re-run</button>',
      '',
      '<!-- image click-to-enlarge, wired once in app.config.ts -->',
      'provideCodingAgentChat({ mediaLightbox: MyLightboxService })',
    ].join('\n'),
  },
  theme: {
    label: 'styles.scss + any parent element',
    code: [
      "@use 'coding-agent-chat/theme/cac-theme.css';",
      '',
      '<!-- light/dark per subtree — nest them freely: -->',
      '<div data-studio-theme="light"> …chat surfaces… </div>',
    ].join('\n'),
  },
};
