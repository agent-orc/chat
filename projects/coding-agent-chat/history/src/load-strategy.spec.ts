/**
 * Pure unit specs for the chat-history backfill decision function and
 * the step-load panel headline. Vendored 1:1 from the host frontend so
 * the wording + threshold semantics stay locked across the extraction.
 */
import {
  decideLoadAction,
  formatLoadedSummary,
  planInitialHistoryWindow,
} from './load-strategy';

describe('decideLoadAction', () => {
  const base = {
    loadedCount: 0,
    hasMoreOlder: true,
    isLoading: false,
    isNearTop: true,
    threshold: 1000,
  };

  it('returns no-op when there is no more older history', () => {
    expect(decideLoadAction({ ...base, hasMoreOlder: false })).toBe('no-op');
  });

  it('returns no-op while a request is already in flight', () => {
    expect(decideLoadAction({ ...base, isLoading: true })).toBe('no-op');
  });

  it('shows the step-load panel once loaded count reaches the threshold', () => {
    expect(decideLoadAction({ ...base, loadedCount: 1000 })).toBe('show-panel');
    expect(decideLoadAction({ ...base, loadedCount: 4711 })).toBe('show-panel');
  });

  it('shows the panel even if the user is not near the top', () => {
    // Past threshold, scroll-driven loading is off entirely — the panel
    // is the only path forward.
    expect(decideLoadAction({ ...base, loadedCount: 1500, isNearTop: false })).toBe('show-panel');
  });

  it('continues backfill below the threshold when near top', () => {
    expect(decideLoadAction({ ...base, loadedCount: 200 })).toBe('continue-backfill');
  });

  it('shows the boundary prompt when the age layer is hidden', () => {
    expect(
      decideLoadAction({
        ...base,
        loadedCount: 100,
        hidesOlderMessages: true,
      }),
    ).toBe('show-panel');
  });

  it('never silently crosses the configured maximum', () => {
    expect(
      decideLoadAction({
        ...base,
        loadedCount: 5000,
        threshold: 10_000,
        maximumReached: true,
      }),
    ).toBe('show-panel');
  });

  it('returns no-op below the threshold when not near top', () => {
    expect(decideLoadAction({ ...base, loadedCount: 200, isNearTop: false })).toBe('no-op');
  });
});

describe('planInitialHistoryWindow', () => {
  const base = {
    totalCount: 501,
    oldestTs: '2026-06-01T12:00:00.000Z',
    newestTs: '2026-06-30T12:00:00.000Z',
    messageCountThreshold: 500,
    messageAgeDays: 7,
    smallChatMessageCount: 30,
    maxWindowMessageCount: 5000,
  };

  it('hides the old layer only when count is greater than N and old messages exist', () => {
    expect(planInitialHistoryWindow(base)).toEqual({
      after: '2026-06-23T11:59:59.999Z',
      limit: 5000,
      hidesOlderMessages: true,
    });
    expect(planInitialHistoryWindow({ ...base, totalCount: 500 })).toEqual({
      limit: 500,
      hidesOlderMessages: false,
    });
    expect(
      planInitialHistoryWindow({
        ...base,
        oldestTs: '2026-06-24T12:00:00.000Z',
      }).hidesOlderMessages,
    ).toBe(false);
  });

  it('keeps a message exactly D days old inside the recent layer', () => {
    const plan = planInitialHistoryWindow(base);
    expect(Date.parse(plan.after!)).toBe(
      Date.parse(base.newestTs) - base.messageAgeDays * 24 * 60 * 60 * 1000 - 1,
    );
  });

  it('loads small chats in full even when their messages span previous days', () => {
    expect(planInitialHistoryWindow({ ...base, totalCount: 30 })).toEqual({
      limit: 30,
      hidesOlderMessages: false,
    });
  });

  it('caps an unwindowed initial request at the overall maximum', () => {
    expect(
      planInitialHistoryWindow({
        ...base,
        totalCount: 6000,
        oldestTs: '2026-06-29T12:00:00.000Z',
      }),
    ).toEqual({ limit: 5000, hidesOlderMessages: false });
  });
});

describe('formatLoadedSummary', () => {
  it('includes total when known', () => {
    const s = formatLoadedSummary(1000, 47238, '2026-04-15T10:00:00Z');
    expect(s).toContain('1,000');
    expect(s).toContain('47,238');
    expect(s).toContain('messages');
  });

  it('omits total when unknown', () => {
    const s = formatLoadedSummary(50, null, null);
    expect(s).toContain('50');
    expect(s).not.toContain(' of ');
  });

  it('includes oldest date when provided', () => {
    const s = formatLoadedSummary(100, 200, '2026-04-15T10:00:00Z');
    expect(s).toContain('Oldest loaded');
  });
});
