/**
 * Specs for the virtualised history list over a corpus-backed stub
 * ProjectChatDataSource: initial tail load + row rendering, the no-op
 * default seam (empty state), near-top cursor backfill ("load older"),
 * the deep-history step-load panel (backfill stops, panel pages
 * explicitly), range-based windowing + spacers, search mode with
 * snippet <mark> resolution + turnSelected, live appends, and the
 * CHAT_HISTORY_CONFIRM guard on "jump to start".
 */
import type { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EMPTY, of, throwError } from 'rxjs';

import { CHAT_HISTORY_CONFIRM, type ChatHistoryConfirm } from '../chat-history-confirm.token';
import {
  CHAT_HISTORY_WINDOW_CONFIG,
  resolveChatHistoryWindowConfig,
  type ChatHistoryWindowOptions,
} from '../history-window-config';
import {
  PROJECT_CHAT_DATA_SOURCE,
  type ProjectChatDataSource,
  type ProjectChatScrollRequest,
} from '../project-chat-data-source.token';
import type { ProjectChatSearchHit, ProjectChatTurn } from '../project-chat.model';
import { ProjectChatListComponent } from './project-chat-list.component';

// jsdom implements neither scrollIntoView nor layout; the component only
// calls it best-effort after a flash/jump, so a no-op is enough. CSS.escape
// is also missing — the fixture turn ids are already selector-safe.
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  if (typeof CSS === 'undefined') {
    (globalThis as Record<string, unknown>)['CSS'] = {
      escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&'),
    };
  }
});

/** Chronological fixture corpus: turn-0000 is the oldest. */
function makeCorpus(count: number, intervalMs = 1000): ProjectChatTurn[] {
  return Array.from({ length: count }, (_, i) => ({
    turnId: `turn-${String(i).padStart(4, '0')}`,
    author: 'agent' as const,
    kind: 'turn' as const,
    ts: new Date(Date.UTC(2026, 0, 1) + i * intervalMs).toISOString(),
    body: `body of turn ${i}`,
  }));
}

/**
 * Corpus-backed stub: `scroll` slices reverse-chronological pages out of
 * a chronological corpus exactly like the reference backend's ts-cursor
 * pagination, and every call is recorded for the load-strategy asserts.
 */
class StubDataSource implements ProjectChatDataSource {
  readonly scrollCalls: Array<{ project: string; request: ProjectChatScrollRequest }> = [];
  readonly searchCalls: Array<{ project: string; query: string; limit: number }> = [];
  searchResults: ProjectChatSearchHit[] = [];
  statsError = false;

  constructor(readonly corpus: ProjectChatTurn[]) {}

  scroll(project: string, request: ProjectChatScrollRequest) {
    this.scrollCalls.push({ project, request });
    const limit = request.limit ?? 50;
    const before = request.before;
    const after = request.after;
    const eligible = before
      ? this.corpus.filter((t) => t.ts < before)
      : after
        ? this.corpus.filter((t) => t.ts > after)
        : this.corpus;
    const turns = eligible.slice(-limit).reverse(); // newest first
    return of({ project, direction: before ? ('before' as const) : ('tail' as const), turns });
  }

  search(project: string, query: string, limit: number) {
    this.searchCalls.push({ project, query, limit });
    return of({ project, results: this.searchResults });
  }

  stats(project: string) {
    if (this.statsError) return throwError(() => new Error('stats unavailable'));
    const corpus = this.corpus;
    return of({
      project,
      totalCount: corpus.length,
      oldestTs: corpus[0]?.ts ?? null,
      newestTs: corpus[corpus.length - 1]?.ts ?? null,
    });
  }

  turn(project: string, turnId: string) {
    const turn = this.corpus.find((t) => t.turnId === turnId);
    return turn ? of({ project, turn }) : EMPTY;
  }
}

/** Flush the queueMicrotask/promise chains loadOlder resolves through. */
async function flush(fixture: { whenStable(): Promise<unknown> }): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
}

interface RenderOptions {
  confirm?: ChatHistoryConfirm;
  historyWindow?: ChatHistoryWindowOptions;
}

async function render(dataSource: ProjectChatDataSource | null, options: RenderOptions = {}) {
  const providers: Provider[] = [];
  if (dataSource) providers.push({ provide: PROJECT_CHAT_DATA_SOURCE, useValue: dataSource });
  if (options.confirm) providers.push({ provide: CHAT_HISTORY_CONFIRM, useValue: options.confirm });
  if (options.historyWindow) {
    providers.push({
      provide: CHAT_HISTORY_WINDOW_CONFIG,
      useValue: resolveChatHistoryWindowConfig(options.historyWindow),
    });
  }
  if (providers.length > 0) {
    TestBed.configureTestingModule({ providers });
  }
  const fixture = TestBed.createComponent(ProjectChatListComponent);
  fixture.componentRef.setInput('project', 'demo');
  await fixture.whenStable();
  await flush(fixture);
  return fixture;
}

describe('ProjectChatListComponent (initial load)', () => {
  it('loads the newest tail page through the data-source seam and renders one cac-chat-row per turn', async () => {
    const source = new StubDataSource(makeCorpus(5));
    const fixture = await render(source);

    expect(source.scrollCalls.length).toBe(1);
    expect(source.scrollCalls[0].project).toBe('demo');
    expect(source.scrollCalls[0].request.limit).toBe(5);
    expect(source.scrollCalls[0].request.before).toBeUndefined();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('cac-chat-row');
    expect(rows.length).toBe(5);
    // Chronological order, oldest at the top like an IRC log.
    expect(rows[0].getAttribute('data-turnid')).toBe('turn-0000');
    expect(rows[4].getAttribute('data-turnid')).toBe('turn-0004');
    expect(rows[4].textContent).toContain('body of turn 4');
    // A short page means the server has no more older history.
    expect(fixture.componentInstance.hasMoreOlder()).toBe(false);
  });

  it('renders the empty state with the default no-op data source (no host wiring)', async () => {
    const fixture = await render(null);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('cac-chat-row').length).toBe(0);
    expect(el.querySelector('.pchat__empty')?.textContent).toContain('No conversation yet');
    expect(el.querySelector('[data-testid="pchat-error"]')).toBeNull();
  });
});

describe('ProjectChatListComponent (load older / step-load strategy)', () => {
  it('backfills one page with a before-cursor when scrolled near the top', async () => {
    const source = new StubDataSource(makeCorpus(80));
    source.statsError = true;
    const fixture = await render(source, {
      historyWindow: { initialPageMessageCount: 50 },
    });
    const component = fixture.componentInstance;

    expect(component.allTurns().length).toBe(50);
    expect(component.hasMoreOlder()).toBe(true);
    const oldestLoadedTs = component.allTurns()[0].ts;

    // jsdom has no layout; scrollTop stays 0 which counts as near-top.
    component.onScroll();
    await flush(fixture);

    expect(source.scrollCalls.length).toBe(2);
    expect(source.scrollCalls[1].request.before).toBe(oldestLoadedTs);
    expect(component.allTurns().length).toBe(80);
    expect(component.allTurns()[0].turnId).toBe('turn-0000');
    // The 30-turn short page marks the history as exhausted.
    expect(component.hasMoreOlder()).toBe(false);
  });

  it('stops silent backfill past the deep-history threshold and shows the step-load panel', async () => {
    const source = new StubDataSource(makeCorpus(80, 24 * 60 * 60 * 1000));
    const fixture = await render(source, {
      historyWindow: { messageCountThreshold: 10, smallChatMessageCount: 5 },
    });
    const component = fixture.componentInstance;

    component.onScroll();
    await flush(fixture);

    // No cursor backfill happened — the panel takes over instead.
    expect(source.scrollCalls.length).toBe(1);
    expect(component.showStepLoadPanel()).toBe(true);

    const el: HTMLElement = fixture.nativeElement;
    const panel = el.querySelector('[data-testid="pchat-step-load-panel"]');
    expect(panel).toBeTruthy();
    expect(el.querySelector('[data-testid="pchat-boundary-prompt"]')?.textContent).toContain(
      'Older messages are hidden',
    );
    expect(el.querySelector('[data-testid="pchat-step-summary"]')?.textContent).toContain('of 80 messages.');
  });

  it('extends the age window by the configured chunk only after the prompt is confirmed', async () => {
    const source = new StubDataSource(makeCorpus(80, 24 * 60 * 60 * 1000));
    const fixture = await render(source, {
      historyWindow: {
        messageCountThreshold: 10,
        smallChatMessageCount: 5,
        loadMoreMessageCount: 20,
        pageMessageCount: 10,
      },
    });
    const component = fixture.componentInstance;
    const initialCount = component.allTurns().length;
    const windowEvents: Array<{ name: string; addedMessageCount?: number }> = [];
    component.historyWindowEvent.subscribe((event) => windowEvents.push(event));

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="pchat-load-older"]',
    );
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain('Load 20 older messages');
    button!.click();
    await flush(fixture);
    await flush(fixture);

    expect(component.allTurns().length).toBe(initialCount + 20);
    expect(source.scrollCalls.slice(1).map((call) => call.request.limit)).toEqual([10, 10]);
    expect(windowEvents).toContainEqual(
      expect.objectContaining({
        name: 'history_window_extended',
        addedMessageCount: 20,
      }),
    );
  });

  it('shows all previous days immediately for a small chat', async () => {
    const source = new StubDataSource(makeCorpus(25, 24 * 60 * 60 * 1000));
    const fixture = await render(source, {
      historyWindow: { messageCountThreshold: 10, smallChatMessageCount: 30 },
    });

    expect(fixture.componentInstance.allTurns().length).toBe(25);
    expect(fixture.componentInstance.ageBoundaryHidden()).toBe(false);
    expect(fixture.componentInstance.showStepLoadPanel()).toBe(false);
    expect(source.scrollCalls[0].request.after).toBeUndefined();
  });

  it('enforces the overall maximum and disables further extension', async () => {
    const source = new StubDataSource(makeCorpus(80));
    const fixture = await render(source, {
      historyWindow: {
        messageCountThreshold: 50,
        smallChatMessageCount: 10,
        maxWindowMessageCount: 20,
      },
    });

    expect(fixture.componentInstance.allTurns().length).toBe(20);
    expect(fixture.componentInstance.maximumWindowReached()).toBe(true);
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="pchat-load-older"]',
    );
    expect(button?.disabled).toBe(true);
  });

  it('asks the CHAT_HISTORY_CONFIRM seam before "jump to start" and aborts on decline', async () => {
    const source = new StubDataSource(makeCorpus(5));
    let confirmCalls = 0;
    const fixture = await render(source, {
      confirm: {
        confirm: () => {
          confirmCalls += 1;
          return Promise.resolve(false);
        },
      },
    });
    const component = fixture.componentInstance;
    component.totalCount.set(5000); // above jumpToStartConfirmAt
    component.hasMoreOlder.set(true);
    const callsBefore = source.scrollCalls.length;

    await component.jumpToStart();
    await flush(fixture);

    expect(confirmCalls).toBe(1);
    expect(source.scrollCalls.length).toBe(callsBefore);
  });
});

describe('ProjectChatListComponent (windowing)', () => {
  it('renders only the visible window and sizes the spacers from the row-height estimate', async () => {
    const source = new StubDataSource(makeCorpus(80));
    const fixture = await render(source);
    const component = fixture.componentInstance;

    component.visibleStart.set(10);
    component.visibleEnd.set(20);
    await fixture.whenStable();

    expect(component.windowedTurns().length).toBe(10);
    expect(component.windowedTurns()[0].turnId).toBe('turn-0010');
    expect(component.topSpacerPx()).toBe(10 * component.rowHeightPx);
    expect(component.bottomSpacerPx()).toBe((80 - 20) * component.rowHeightPx);

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('cac-chat-row');
    expect(rows.length).toBe(10);
  });
});

describe('ProjectChatListComponent (search mode)', () => {
  it('runs a search through the seam, marks snippets and returns to live on hit click', async () => {
    const source = new StubDataSource(makeCorpus(5));
    source.searchResults = [
      {
        turnId: 'turn-0002',
        author: 'agent',
        kind: 'turn',
        ts: source.corpus[2].ts,
        snippet: 'body of <b>turn</b> 2',
        score: 1.23,
      },
    ];
    const fixture = await render(source);
    const component = fixture.componentInstance;

    component.searchQuery.set('turn');
    component.runSearch();
    await flush(fixture);

    expect(source.searchCalls).toEqual([{ project: 'demo', query: 'turn', limit: 20 }]);
    expect(component.mode()).toBe('search');

    const el: HTMLElement = fixture.nativeElement;
    const hit = el.querySelector<HTMLButtonElement>('[data-testid="pchat-hit"]');
    expect(hit).toBeTruthy();
    expect(hit?.getAttribute('data-turnid')).toBe('turn-0002');
    // `<b>` highlight markers are resolved to accessible `<mark>`.
    expect(hit?.querySelector('.pchat__hit-snippet mark')?.textContent).toBe('turn');

    const selected: string[] = [];
    component.turnSelected.subscribe((e) => selected.push(e.turnId));
    hit!.click();
    await flush(fixture);

    expect(selected).toEqual(['turn-0002']);
    expect(component.mode()).toBe('live');
    // The clicked turn gets the flash highlight in the live list.
    expect(component.flashTurnId()).toBe('turn-0002');
  });
});

describe('ProjectChatListComponent (live appends)', () => {
  it('appends fresh live turns in ts order and dedupes already-seen ids', async () => {
    const source = new StubDataSource(makeCorpus(5));
    const fixture = await render(source);
    const component = fixture.componentInstance;

    const live: ProjectChatTurn = {
      turnId: 'turn-live',
      author: 'orchestrator',
      kind: 'turn',
      ts: new Date(Date.UTC(2026, 0, 2)).toISOString(),
      body: 'fresh live turn',
    };
    component.appendLive(live);
    component.appendLive(live); // dup — must be ignored
    component.appendLive(source.corpus[3]); // already loaded — must be ignored
    await fixture.whenStable();

    expect(component.allTurns().length).toBe(6);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('cac-chat-row');
    expect(rows[rows.length - 1].getAttribute('data-turnid')).toBe('turn-live');
  });
});
