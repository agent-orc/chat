import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

// ng-packagr emits partially compiled Angular modules. Loading the compiler
// first supplies the JIT fallback required when this benchmark imports the
// built composer entry point directly in Node.
await import('@angular/compiler');
const { groupIntoPhases } = await import(
  '../dist/coding-agent-chat/fesm2022/coding-agent-chat-composer.mjs'
);
const require = createRequire(import.meta.url);
const angularVersion = require('@angular/core/package.json').version;
const jsdomVersion = require('jsdom/package.json').version;

const SIZES = [100, 500, 1000, 5000];
const ROW_HEIGHT_PX = 120;
const BUFFER_ROWS = 50;
const VIEWPORT_HEIGHT_PX = 720;
const RUNS = 30;
const SCROLL_STEPS = 25;

const dom = new JSDOM('<main id="history"></main>');
const document = dom.window.document;
const host = document.querySelector('#history');

function makeCorpus(count) {
  return Array.from({ length: count }, (_, index) => ({
    turnId: `turn-${index}`,
    author: index % 12 === 0 ? 'user' : index % 5 === 0 ? 'orchestrator' : 'agent',
    kind: index % 17 === 0 ? 'event-tool-call' : 'turn',
    ts: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(),
    refs: index % 9 === 0 ? ['role:coder'] : null,
    body: `Message ${index}: ${'representative coding-agent output '.repeat(8)}`,
  }));
}

function project(corpus) {
  const phaseInput = corpus.map((turn) => ({
    id: turn.turnId,
    ts: turn.ts,
    author: turn.author,
    kind: turn.kind,
    refs: turn.refs,
  }));
  const phases = groupIntoPhases(phaseInput);
  // Benchmark the worst-case expanded timeline. The product normally starts
  // with earlier phases collapsed, which is cheaper than this measurement.
  const expandedPhaseIds = new Set(phases.map((phase) => phase.id));
  const hiddenTurnIds = new Set();
  for (const phase of phases) {
    if (expandedPhaseIds.has(phase.id)) continue;
    for (const id of phase.messageIds) hiddenTurnIds.add(id);
  }
  return hiddenTurnIds.size
    ? corpus.filter((turn) => !hiddenTurnIds.has(turn.turnId))
    : corpus;
}

function windowAt(turns, scrollTop) {
  const start = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT_PX) - BUFFER_ROWS,
  );
  const end =
    Math.ceil((scrollTop + VIEWPORT_HEIGHT_PX) / ROW_HEIGHT_PX) + BUFFER_ROWS;
  return turns.slice(start, Math.min(turns.length, end));
}

function paint(rows) {
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const article = document.createElement('article');
    article.dataset.turnid = row.turnId;
    const meta = document.createElement('header');
    meta.textContent = `${row.author} · ${row.kind} · ${row.ts}`;
    const body = document.createElement('p');
    body.textContent = row.body;
    article.append(meta, body);
    fragment.append(article);
  }
  host.replaceChildren(fragment);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function format(value) {
  return value.toFixed(2);
}

const results = [];
for (const size of SIZES) {
  const corpus = makeCorpus(size);

  for (let warmup = 0; warmup < 5; warmup += 1) {
    const projected = project(corpus);
    paint(windowAt(projected, 0));
  }

  const initialSamples = [];
  for (let run = 0; run < RUNS; run += 1) {
    const startedAt = performance.now();
    const projected = project(corpus);
    paint(windowAt(projected, 0));
    initialSamples.push(performance.now() - startedAt);
  }

  const projected = project(corpus);
  const maximumScrollTop = Math.max(
    0,
    projected.length * ROW_HEIGHT_PX - VIEWPORT_HEIGHT_PX,
  );
  const scrollSamples = [];
  for (let run = 0; run < RUNS; run += 1) {
    const startedAt = performance.now();
    for (let step = 0; step < SCROLL_STEPS; step += 1) {
      const ratio = SCROLL_STEPS === 1 ? 0 : step / (SCROLL_STEPS - 1);
      paint(windowAt(projected, maximumScrollTop * ratio));
    }
    scrollSamples.push((performance.now() - startedAt) / SCROLL_STEPS);
  }

  results.push({
    size,
    initialMedianMs: percentile(initialSamples, 0.5),
    initialP95Ms: percentile(initialSamples, 0.95),
    scrollMedianMs: percentile(scrollSamples, 0.5),
    scrollP95Ms: percentile(scrollSamples, 0.95),
    retainedKiB: Buffer.byteLength(JSON.stringify(corpus), 'utf8') / 1024,
    maximumPaintedRows: Math.min(
      size,
      Math.ceil(VIEWPORT_HEIGHT_PX / ROW_HEIGHT_PX) + BUFFER_ROWS * 2,
    ),
  });
}

console.log(
  'History window benchmark (%s %s, Node %s, Angular %s, jsdom %s, %s)',
  process.platform,
  os.release(),
  process.version,
  angularVersion,
  jsdomVersion,
  os.cpus()[0]?.model ?? 'unknown CPU',
);
console.log(
  '| Messages | Initial projection + paint median (ms) | p95 (ms) | Scroll update median (ms) | p95 (ms) | Retained fixture (KiB) | Max painted rows |',
);
console.log(
  '| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
);
for (const result of results) {
  console.log(
    `| ${result.size} | ${format(result.initialMedianMs)} | ${format(result.initialP95Ms)} | ${format(result.scrollMedianMs)} | ${format(result.scrollP95Ms)} | ${format(result.retainedKiB)} | ${result.maximumPaintedRows} |`,
  );
}
