/**
 * Static fixture for the rendering showcase: one compact exchange that puts
 * the markdown pipeline's headline features on display — syntax-highlighted
 * fenced code (lowlight/highlight.js, class-based tokens that survive the
 * sanitizer) and images, both as an `artifact.image` row and inline in
 * markdown, all click-to-enlarge through the site's lightbox seam.
 *
 * No replay pacing here: the exchange renders complete, so the section is
 * skimmable without pressing play.
 */

import type {
  ArtifactImageEvent,
  ConversationEvent,
  MessageEvent,
  RawLineRange,
} from 'coding-agent-chat/core';

const SOURCE = 'website-demo-rendering.log';

let lineCursor = 0;
function nextRange(span = 2): RawLineRange {
  const start = lineCursor + 1;
  lineCursor = start + span - 1;
  return { source: SOURCE, start, end: lineCursor };
}

/** Fixed base timestamp so the prerendered HTML is deterministic. */
function at(minute: number, second = 0): string {
  return new Date(Date.UTC(2026, 6, 3, 9, minute, second)).toISOString();
}

const userAsk: MessageEvent = {
  id: 'sc-user-1',
  kind: 'message.user',
  timestamp: at(0),
  actor: 'You',
  body: 'The `/search` endpoint is slow under load. Profile it, fix the hot path, and show me before/after numbers — screenshots please.',
  rawRange: nextRange(),
};

const agentCode: MessageEvent = {
  id: 'sc-agent-1',
  kind: 'message.taskAgent',
  timestamp: at(2),
  actor: 'Agent',
  body: [
    'Profiled it — 78% of the time went into re-normalizing the same query terms on every request. The fix is a bounded memo in front of the tokenizer:',
    '',
    '```ts',
    'const CACHE_MAX = 4_096; // bounded: evict oldest on overflow',
    'const normalized = new Map<string, readonly Token[]>();',
    '',
    'export function tokenize(query: string): readonly Token[] {',
    '  const hit = normalized.get(query);',
    '  if (hit !== undefined) return hit; // hot path: zero allocation',
    '  const tokens = segment(query).map((t) => ({',
    '    text: t.text.toLocaleLowerCase(),',
    '    weight: t.isPrefix ? 2.5 : 1,',
    '  }));',
    '  if (normalized.size >= CACHE_MAX) evictOldest(normalized);',
    '  normalized.set(query, tokens);',
    '  return tokens;',
    '}',
    '```',
    '',
    'Keywords, strings, numbers and comments each carry their own token colour — the palette flips with the light/dark theme above.',
  ].join('\n'),
  rawRange: nextRange(20),
};

const chartArtifact: ArtifactImageEvent = {
  id: 'sc-artifact-1',
  kind: 'artifact.image',
  timestamp: at(3, 20),
  caption: 'Latency p95 by route — before vs. after the tokenizer memo (−81%)',
  url: 'media/latency-chart.svg',
  sourcePath: '/tmp/profile/latency-chart.svg',
  durablePath: 'results/latency-chart.svg',
  sourceTool: 'agent',
  rawRange: nextRange(),
};

// BOTH proofs live in ONE message on purpose: the lightbox directive collects
// its gallery per message body, so this pair is what makes arrow-key paging
// demonstrable on the page (the artifact row above opens as a single image).
const agentInlineImage: MessageEvent = {
  id: 'sc-agent-2',
  kind: 'message.taskAgent',
  timestamp: at(4, 10),
  actor: 'Agent',
  body: [
    'All 29 search specs stay green with the cache in place — both proofs inline:',
    '',
    '![Latency p95 by route — before vs. after the tokenizer memo](media/latency-chart.svg)',
    '',
    '![Terminal — 29/29 search specs green, 94.2% coverage](media/spec-run.svg)',
    '',
    'Click an image to enlarge it — in this two-image message the arrow keys flip between them.',
  ].join('\n'),
  rawRange: nextRange(10),
};

export const SHOWCASE_EVENTS: readonly ConversationEvent[] = [
  userAsk,
  agentCode,
  chartArtifact,
  agentInlineImage,
];
