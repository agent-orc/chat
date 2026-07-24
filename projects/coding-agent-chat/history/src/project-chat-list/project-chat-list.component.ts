import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import {
  RoleBadgeComponent,
  groupIntoPhases,
  type ChatPhase,
  type PhaseInputMessage,
} from 'coding-agent-chat/composer';
import { ModelLevelIndicatorComponent, TooltipDirective } from 'coding-agent-chat/shared';

import { CHAT_HISTORY_CONFIRM } from '../chat-history-confirm.token';
import { ChatRowComponent, type ChatRowInput } from '../chat-row/chat-row.component';
import {
  CHAT_HISTORY_WINDOW_CONFIG,
  type ChatHistoryWindowEvent,
} from '../history-window-config';
import {
  decideLoadAction,
  formatLoadedSummary,
  planInitialHistoryWindow,
} from '../load-strategy';
import { PhaseSummaryListComponent } from '../phase-summary-list/phase-summary-list.component';
import { PROJECT_CHAT_DATA_SOURCE } from '../project-chat-data-source.token';
import { ProjectChatRailComponent } from '../project-chat-rail/project-chat-rail.component';
import type {
  ProjectChatSearchHit,
  ProjectChatStatsResponse,
  ProjectChatTurn,
} from '../project-chat.model';

/**
 * Virtualised chat-history list. A windowed view over a per-project
 * chat corpus served through the {@link PROJECT_CHAT_DATA_SOURCE} host
 * seam. Two modes:
 *
 * - **live**: paginate by ts cursor, append newest turns from the
 *   host's live stream when they arrive (the parent component forwards
 *   them via `appendLive`).
 * - **search**: BM25-ranked FTS hits with `<b>...</b>` snippet markup
 *   resolved client-side to `<mark>` for accessibility + styling.
 *   Click a result → returns to live and scrolls + flashes that turn.
 *
 * Virtualisation is range-based: we render only the visible viewport
 * plus a 50-turn over-scroll buffer above and below. With a 120 px
 * default row, that's at most ~150 DOM nodes regardless of how many
 * thousand turns the project has.
 *
 * Host wiring: all loading goes through the injected data source (a
 * no-op empty-history default keeps the component renderable without a
 * host); the "jump to start" guard prompt goes through the optional
 * CHAT_HISTORY_CONFIRM seam.
 */
@Component({
  selector: 'cac-project-chat-list',
  standalone: true,
  imports: [
    ProjectChatRailComponent,
    RoleBadgeComponent,
    PhaseSummaryListComponent,
    TooltipDirective,
    ModelLevelIndicatorComponent,
    ChatRowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-chat-list.component.html',
  styleUrl: './project-chat-list.component.scss',
})
export class ProjectChatListComponent implements OnInit, OnDestroy {
  readonly project = input<string | null>(null);

  /** Emits when the user clicks a search result so the host can reset
   *  any per-project state (e.g. local optimistic turns). */
  readonly turnSelected = output<{ turnId: string }>();

  /** Stable operational events for initial policy decisions and explicit extension loads. */
  readonly historyWindowEvent = output<ChatHistoryWindowEvent>();

  @ViewChild('scrollHost', { static: true }) scrollHost!: ElementRef<HTMLDivElement>;

  /** Resolved once per component; hosts can override it through the public provider. */
  readonly historyWindowConfig = inject(CHAT_HISTORY_WINDOW_CONFIG);

  // ── Live mode ─────────────────────────────────────────────────────
  readonly allTurns = signal<ProjectChatTurn[]>([]);
  readonly loadingInitial = signal(false);
  readonly loadingOlder = signal(false);
  readonly hasMoreOlder = signal(true);
  readonly errorMsg = signal<string | null>(null);
  private readonly seenIds = new Set<string>();

  // ── Search mode ───────────────────────────────────────────────────
  readonly mode = signal<'live' | 'search'>('live');
  readonly searchQuery = signal('');
  readonly searchHits = signal<ProjectChatSearchHit[]>([]);
  readonly searching = signal(false);
  private searchSubmittedQuery = '';

  // ── Virtualisation state ──────────────────────────────────────────
  readonly visibleStart = signal(0);
  readonly visibleEnd = signal(50);
  readonly rowHeightPx = this.historyWindowConfig.estimatedRowHeightPx;
  readonly bufferRows = this.historyWindowConfig.virtualBufferRows;

  // ── Step-load panel state ─────────────────────────────────────────
  /**
   * Past this many loaded turns, the silent on-scroll backfill stops
   * and the step-load panel takes over. Operator decides how much
   * further to go — "scroll for days/weeks" must not freeze the
   * browser.
   */
  readonly totalCount = signal<number | null>(null);
  readonly oldestServerTs = signal<string | null>(null);
  /** True when the initial request deliberately stopped at the age cutoff. */
  readonly ageBoundaryHidden = signal(false);
  readonly jumpDate = signal('');

  // ── Phase summary layer ──────────────────────────────────────────
  /**
   * User-driven expansion overrides. The default expansion is "only the
   * newest phase is open", computed inside `expandedPhaseIds` when this
   * set is empty.
   */
  readonly phaseOverrides = signal<ReadonlyMap<string, boolean>>(new Map());

  readonly phases = computed<ChatPhase[]>(() => {
    const input: PhaseInputMessage[] = this.allTurns().map((t) => ({
      id: t.turnId,
      ts: t.ts,
      author: t.author,
      kind: t.kind,
      refs: t.refs ?? null,
    }));
    return groupIntoPhases(input);
  });

  readonly expandedPhaseIds = computed<ReadonlySet<string>>(() => {
    const phases = this.phases();
    const overrides = this.phaseOverrides();
    if (overrides.size === 0) {
      if (phases.length === 0) return new Set();
      return new Set([phases[phases.length - 1].id]);
    }
    // Default newest-expanded baseline, then apply overrides on top so a
    // user's explicit collapse of the newest phase is honoured.
    const baseline = new Set<string>();
    if (phases.length > 0) baseline.add(phases[phases.length - 1].id);
    for (const [id, expanded] of overrides) {
      if (expanded) baseline.add(id);
      else baseline.delete(id);
    }
    return baseline;
  });

  /** Turn ids that belong to a collapsed phase. Hidden from the timeline. */
  readonly hiddenTurnIds = computed<ReadonlySet<string>>(() => {
    const expanded = this.expandedPhaseIds();
    const hidden = new Set<string>();
    for (const phase of this.phases()) {
      if (expanded.has(phase.id)) continue;
      for (const id of phase.messageIds) hidden.add(id);
    }
    return hidden;
  });

  readonly flashTurnId = signal<string | null>(null);
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Turns that survive the phase-collapse filter. Drives the virtualised
   * window so collapsing an older phase removes its rows from the timeline
   * without disturbing the loaded chat-history substrate.
   */
  readonly visibleTurns = computed<ProjectChatTurn[]>(() => {
    const hidden = this.hiddenTurnIds();
    if (hidden.size === 0) return this.allTurns();
    return this.allTurns().filter((t) => !hidden.has(t.turnId));
  });

  readonly windowedTurns = computed<ProjectChatTurn[]>(() => {
    const all = this.visibleTurns();
    const start = Math.max(0, this.visibleStart());
    const end = Math.min(all.length, this.visibleEnd());
    return all.slice(start, end);
  });

  readonly topSpacerPx = computed(() => this.visibleStart() * this.rowHeightPx);
  readonly bottomSpacerPx = computed(() => {
    const remaining = this.visibleTurns().length - this.visibleEnd();
    return Math.max(0, remaining) * this.rowHeightPx;
  });

  readonly maximumWindowReached = computed(
    () => this.allTurns().length >= this.historyWindowConfig.maxWindowMessageCount,
  );

  /** Threshold reached + still more older history available + not searching. */
  readonly showStepLoadPanel = computed(() => {
    if (this.mode() !== 'live') return false;
    if (!this.hasMoreOlder()) return false;
    return (
      this.ageBoundaryHidden() ||
      this.maximumWindowReached() ||
      this.allTurns().length >= this.historyWindowConfig.messageCountThreshold
    );
  });

  readonly loadMoreLabel = `Load ${this.historyWindowConfig.loadMoreMessageCount.toLocaleString(
    'en-US',
  )} older messages`;

  /** Headline rendered inside the step-load panel. Pure-function call
   *  keeps the wording locked by `load-strategy.spec.ts`. */
  readonly stepLoadSummary = computed(() => {
    const all = this.allTurns();
    const oldest = all.length ? all[0].ts : this.oldestServerTs();
    return formatLoadedSummary(all.length, this.totalCount(), oldest);
  });

  private readonly dataSource = inject(PROJECT_CHAT_DATA_SOURCE);
  private readonly confirmDialog = inject(CHAT_HISTORY_CONFIRM);
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Reload from scratch when the active project changes.
    effect(() => {
      const proj = this.project();
      if (!proj) {
        this.allTurns.set([]);
        this.seenIds.clear();
        return;
      }
      this.resetAndLoad();
    });
  }

  ngOnInit(): void {
    // Initial window calc deferred until host scroll element is sized.
    queueMicrotask(() => this.recomputeWindow());
  }

  ngOnDestroy(): void {
    if (this.flashTimer != null) clearTimeout(this.flashTimer);
    if (this.searchDebounceTimer != null) clearTimeout(this.searchDebounceTimer);
  }

  /**
   * Append a turn that arrived live (e.g. from the host's streaming
   * write-path). The host knows whether the user is at the bottom and
   * can decide whether to also auto-scroll; we only update state.
   */
  appendLive(turn: ProjectChatTurn): void {
    if (this.seenIds.has(turn.turnId)) return;
    this.seenIds.add(turn.turnId);
    this.allTurns.update((curr) => {
      // Live appends are most-recent; the list is chronological.
      const next = [...curr, turn];
      next.sort((a, b) => a.ts.localeCompare(b.ts));
      const excess = next.length - this.historyWindowConfig.maxWindowMessageCount;
      if (excess > 0) {
        for (const dropped of next.splice(0, excess)) this.seenIds.delete(dropped.turnId);
      }
      return next;
    });
    this.recomputeWindow();
  }

  resetAndLoad(): void {
    this.allTurns.set([]);
    this.seenIds.clear();
    this.hasMoreOlder.set(true);
    this.loadingInitial.set(true);
    this.errorMsg.set(null);
    this.totalCount.set(null);
    this.oldestServerTs.set(null);
    this.ageBoundaryHidden.set(false);
    const proj = this.project();
    if (!proj) {
      this.loadingInitial.set(false);
      return;
    }
    // Stats is best-effort: drives the panel headline. Failure should
    // not abort the chat load itself.
    // Every callback below re-checks the active project: with an async
    // host transport a response for project A can land after the host
    // already switched to B — stale pages must never poison B's state.
    let initialLoadStarted = false;
    const startInitialLoad = (stats: ProjectChatStatsResponse | null): void => {
      if (initialLoadStarted || this.project() !== proj) return;
      initialLoadStarted = true;
      this.loadInitialPage(proj, stats);
    };
    this.dataSource.stats(proj).subscribe({
      next: (resp) => {
        if (this.project() !== proj) return;
        this.totalCount.set(resp.totalCount ?? null);
        this.oldestServerTs.set(resp.oldestTs ?? null);
        startInitialLoad(resp);
      },
      error: () => startInitialLoad(null),
      complete: () => startInitialLoad(null),
    });
  }

  private loadInitialPage(proj: string, stats: ProjectChatStatsResponse | null): void {
    const startedAt = performance.now();
    const cfg = this.historyWindowConfig;
    const plan = stats
      ? planInitialHistoryWindow({
          totalCount: stats.totalCount,
          oldestTs: stats.oldestTs,
          newestTs: stats.newestTs,
          messageCountThreshold: cfg.messageCountThreshold,
          messageAgeDays: cfg.messageAgeDays,
          smallChatMessageCount: cfg.smallChatMessageCount,
          maxWindowMessageCount: cfg.maxWindowMessageCount,
        })
      : {
          limit: Math.min(cfg.initialPageMessageCount, cfg.maxWindowMessageCount),
          hidesOlderMessages: false,
        };
    this.ageBoundaryHidden.set(plan.hidesOlderMessages);
    this.dataSource.scroll(proj, { after: plan.after, limit: plan.limit }).subscribe({
      next: (resp) => {
        if (this.project() !== proj) return;
        // The scroll tail returns reverse-chronological; flip so the
        // chat reads top-to-bottom oldest-to-newest like an IRC log.
        const ordered = [...(resp.turns ?? [])].reverse();
        for (const t of ordered) this.seenIds.add(t.turnId);
        this.allTurns.set(ordered);
        this.loadingInitial.set(false);
        const knownTotal = stats?.totalCount ?? null;
        this.hasMoreOlder.set(
          plan.hidesOlderMessages ||
            (knownTotal != null ? ordered.length < knownTotal : ordered.length === plan.limit),
        );
        this.emitHistoryWindowEvent({
          name: 'history_window_initialized',
          project: proj,
          loadedMessageCount: ordered.length,
          durationMs: performance.now() - startedAt,
          requestedMessageCount: plan.limit,
        });
        // Snap to bottom on first load so the user sees recent turns.
        queueMicrotask(() => {
          this.scrollHost.nativeElement.scrollTop = this.scrollHost.nativeElement.scrollHeight;
          this.recomputeWindow();
        });
      },
      error: (err) => {
        if (this.project() !== proj) return;
        const message = err?.error?.error || err?.message || 'Failed to load chat';
        this.errorMsg.set(message);
        this.loadingInitial.set(false);
        this.emitHistoryWindowEvent({
          name: 'history_window_load_failed',
          project: proj,
          loadedMessageCount: 0,
          durationMs: performance.now() - startedAt,
          requestedMessageCount: plan.limit,
          error: message,
        });
      },
    });
  }

  /**
   * Internal one-page backfill. Returns the number of fresh turns that
   * actually landed in the list (deduped by id) so the step-load loop
   * can decide whether to keep paging.
   */
  private loadOlder(pageSize = 50): Promise<number> {
    return new Promise((resolve) => {
      if (this.loadingOlder() || !this.hasMoreOlder()) {
        resolve(0);
        return;
      }
      const proj = this.project();
      if (!proj) {
        resolve(0);
        return;
      }
      const all = this.allTurns();
      if (all.length === 0) {
        resolve(0);
        return;
      }
      const remainingCapacity = this.historyWindowConfig.maxWindowMessageCount - all.length;
      const boundedPageSize = Math.min(pageSize, remainingCapacity);
      if (boundedPageSize <= 0) {
        resolve(0);
        return;
      }
      this.loadingOlder.set(true);
      const oldest = all[0].ts;
      const host = this.scrollHost.nativeElement;
      const beforeHeight = host.scrollHeight;
      const beforeTop = host.scrollTop;
      this.dataSource.scroll(proj, { before: oldest, limit: boundedPageSize }).subscribe({
        next: (resp) => {
          if (this.project() !== proj) {
            this.loadingOlder.set(false);
            resolve(0);
            return;
          }
          const fetched = [...(resp.turns ?? [])].reverse(); // chronological
          const fresh = fetched.filter((t) => !this.seenIds.has(t.turnId));
          for (const t of fresh) this.seenIds.add(t.turnId);
          if (fresh.length === 0) this.hasMoreOlder.set(false);
          this.allTurns.update((curr) => [...fresh, ...curr]);
          this.loadingOlder.set(false);
          if (resp.turns && resp.turns.length < boundedPageSize) this.hasMoreOlder.set(false);
          // Preserve scroll position relative to the previously-top item.
          queueMicrotask(() => {
            const afterHeight = host.scrollHeight;
            host.scrollTop = beforeTop + (afterHeight - beforeHeight);
            this.recomputeWindow();
            resolve(fresh.length);
          });
        },
        error: (err) => {
          if (this.project() === proj) {
            const message =
              err?.error?.error || err?.message || 'Failed to load older turns';
            this.errorMsg.set(message);
            this.emitHistoryWindowEvent({
              name: 'history_window_load_failed',
              project: proj,
              loadedMessageCount: this.allTurns().length,
              durationMs: 0,
              requestedMessageCount: boundedPageSize,
              error: message,
            });
          }
          this.loadingOlder.set(false);
          resolve(0);
        },
      });
    });
  }

  onScroll(): void {
    this.recomputeWindow();
    const host = this.scrollHost.nativeElement;
    const isNearTop = host.scrollTop < this.historyWindowConfig.boundaryTriggerPx;
    const action = decideLoadAction({
      loadedCount: this.allTurns().length,
      hasMoreOlder: this.hasMoreOlder(),
      isLoading: this.loadingOlder(),
      isNearTop,
      threshold: this.historyWindowConfig.messageCountThreshold,
      hidesOlderMessages: this.ageBoundaryHidden(),
      maximumReached: this.maximumWindowReached(),
    });
    if (action === 'continue-backfill') {
      void this.loadOlder();
    }
    // 'show-panel' is implicit via showStepLoadPanel() in the template;
    // there is nothing to do here. 'no-op' speaks for itself.
  }

  private recomputeWindow(): void {
    const host = this.scrollHost.nativeElement;
    if (!host) return;
    const top = host.scrollTop;
    const viewportH = host.clientHeight || 600;
    const startIdx = Math.max(0, Math.floor(top / this.rowHeightPx) - this.bufferRows);
    const endIdx = Math.ceil((top + viewportH) / this.rowHeightPx) + this.bufferRows;
    if (startIdx !== this.visibleStart()) this.visibleStart.set(startIdx);
    if (endIdx !== this.visibleEnd()) this.visibleEnd.set(endIdx);
  }

  // ── Search ────────────────────────────────────────────────────────
  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.searchQuery.set(value);
    if (this.searchDebounceTimer != null) clearTimeout(this.searchDebounceTimer);
    if (value.trim().length === 0) {
      this.searchHits.set([]);
      this.mode.set('live');
      return;
    }
    this.mode.set('search');
    // Debounce 200ms so each keystroke does not hit the index.
    this.searchDebounceTimer = setTimeout(() => this.runSearch(), 200);
  }

  runSearch(): void {
    const q = this.searchQuery().trim();
    const proj = this.project();
    if (!q || !proj) return;
    this.searchSubmittedQuery = q;
    this.searching.set(true);
    this.mode.set('search');
    this.dataSource.search(proj, q, 20).subscribe({
      next: (resp) => {
        // Ignore late responses for queries the user already moved past —
        // or that belong to a previously active project.
        if (this.searchSubmittedQuery !== q || this.project() !== proj) return;
        this.searchHits.set(resp.results ?? []);
        this.searching.set(false);
      },
      error: (err) => {
        if (this.project() !== proj) return;
        this.searching.set(false);
        this.errorMsg.set(err?.error?.error || err?.message || 'Search failed');
      },
    });
  }

  exitSearch(): void {
    this.mode.set('live');
    this.searchQuery.set('');
    this.searchHits.set([]);
    queueMicrotask(() => this.recomputeWindow());
  }

  openHit(hit: ProjectChatSearchHit): void {
    this.exitSearch();
    this.scrollToTurn(hit.turnId);
    this.turnSelected.emit({ turnId: hit.turnId });
  }

  /** Rail chip click. The rail emits the source turnId; we reuse
   *  `scrollToTurn` so the same flash + virtualisation-anchored load
   *  path that the search-result click uses also drives the rail. */
  onRailChipSelect(event: { turnId: string }): void {
    this.scrollToTurn(event.turnId);
  }

  /** Phase-summary toggle. Records the user's explicit preference for
   *  this phase so the default "newest expanded, rest collapsed" can be
   *  overridden in either direction. */
  onPhaseToggled(event: { phaseId: string; expanded: boolean }): void {
    const next = new Map(this.phaseOverrides());
    next.set(event.phaseId, event.expanded);
    this.phaseOverrides.set(next);
    queueMicrotask(() => this.recomputeWindow());

    // User feedback: "in place expand" — clicking a phase summary row
    // must put the user's eye on the messages that just appeared, not
    // leave them looking at the index. When expanding, scroll the
    // verbatim chat to the phase's first turn so the unhide reads as
    // an inline reveal at the click site (the phase summary stays
    // pinned at the top while the chat below now shows the phase's
    // messages with a flash highlight on the first one).
    if (!event.expanded) return;
    const phase = this.phases().find((p) => p.id === event.phaseId);
    if (!phase || phase.messageIds.length === 0) return;
    const firstTurn = phase.messageIds[0];
    // Two ticks: one for the window recompute above, one for the DOM
    // to settle around the unhid turns before scrollToTurn measures.
    queueMicrotask(() => queueMicrotask(() => this.scrollToTurn(firstTurn)));
  }

  scrollToTurn(turnId: string): void {
    const proj = this.project();
    if (!proj) return;
    const all = this.allTurns();
    const known = all.find((t) => t.turnId === turnId);
    if (known) {
      this.flash(turnId);
      queueMicrotask(() => {
        const el = this.scrollHost.nativeElement.querySelector<HTMLElement>(
          `[data-turnid="${CSS.escape(turnId)}"]`,
        );
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }
    // Not in the loaded window: fetch a slice anchored at this turn's ts.
    this.dataSource.turn(proj, turnId).subscribe({
      next: (resp) => {
        if (this.project() !== proj) return;
        const ts = resp.turn.ts;
        // Load 50 turns around the anchor by asking for `before=<ts+1>`.
        const after = new Date(new Date(ts).getTime() + 1).toISOString();
        this.dataSource.scroll(proj, { before: after, limit: 50 }).subscribe({
          next: (page) => {
            if (this.project() !== proj) return;
            const ordered = [...(page.turns ?? [])].reverse();
            // The anchor page REPLACES the loaded window; reset the dedupe
            // set alongside it so the displaced turns stay re-loadable via
            // the normal backfill path instead of being locked out forever.
            this.seenIds.clear();
            for (const t of ordered) this.seenIds.add(t.turnId);
            this.allTurns.set(ordered);
            this.hasMoreOlder.set(true);
            queueMicrotask(() => {
              const el = this.scrollHost.nativeElement.querySelector<HTMLElement>(
                `[data-turnid="${CSS.escape(turnId)}"]`,
              );
              el?.scrollIntoView({ behavior: 'auto', block: 'center' });
              this.recomputeWindow();
              this.flash(turnId);
            });
          },
        });
      },
    });
  }

  private flash(turnId: string): void {
    this.flashTurnId.set(turnId);
    if (this.flashTimer != null) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flashTurnId.set(null), 1500);
  }

  /** Adapter from the project-chat turn shape to the shared row shape. */
  toChatRow(turn: ProjectChatTurn): ChatRowInput {
    return {
      id: turn.turnId,
      author: turn.author,
      kind: turn.kind,
      refs: turn.refs ?? null,
      model: turn.model ?? null,
      thinkingLevel: turn.thinkingLevel ?? null,
      ts: turn.ts,
      body: turn.body,
      userVariant: turn.author === 'user',
      eventVariant: turn.kind !== 'turn',
      flash: turn.turnId === this.flashTurnId(),
    };
  }

  renderSnippet(snippet: string): string {
    // Backend returns HTML-encoded text with `<b>...</b>` markers
    // preserved. Map to <mark> for accessibility and keep the rest
    // as-is so the host bodies cannot inject arbitrary HTML.
    return (snippet || '').replace(/<b>/g, '<mark>').replace(/<\/b>/g, '</mark>');
  }

  // ── Step-load actions ─────────────────────────────────────────────
  /**
   * Page repeatedly until the oldest loaded turn predates `targetTs`,
   * or the server says there is no more older history, or we hit the
   * count safety cap. Each page is `loadOlder(200)`; scroll-position
   * preservation is handled by `loadOlder` itself.
   */
  async loadBackTo(
    targetTs: string,
    safetyCap = this.historyWindowConfig.maxWindowMessageCount,
  ): Promise<void> {
    const targetMs = new Date(targetTs).getTime();
    if (!Number.isFinite(targetMs)) return;
    let safety = 0;
    while (this.hasMoreOlder()) {
      const all = this.allTurns();
      const oldestLoaded = all.length ? new Date(all[0].ts).getTime() : Number.POSITIVE_INFINITY;
      if (oldestLoaded <= targetMs) break;
      if (safety++ > Math.ceil(safetyCap / this.historyWindowConfig.pageMessageCount)) break;
      const fresh = await this.loadOlder(this.historyWindowConfig.pageMessageCount);
      if (fresh === 0) break;
    }
  }

  /** Page repeatedly until we have at least `targetCount` more turns or
   *  the server reports end-of-history. */
  async loadMoreMessages(targetExtra: number): Promise<void> {
    const startCount = this.allTurns().length;
    const allowedExtra = Math.max(
      0,
      Math.min(
        targetExtra,
        this.historyWindowConfig.maxWindowMessageCount - startCount,
      ),
    );
    let safety = 0;
    while (this.hasMoreOlder()) {
      if (this.allTurns().length - startCount >= allowedExtra) break;
      if (
        safety++ >
        Math.ceil(allowedExtra / this.historyWindowConfig.pageMessageCount) + 1
      ) {
        break;
      }
      const remaining = allowedExtra - (this.allTurns().length - startCount);
      const page = Math.min(this.historyWindowConfig.pageMessageCount, remaining);
      const fresh = await this.loadOlder(page);
      if (fresh === 0) break;
    }
  }

  /** Primary boundary action: one deliberate click extends by the configured chunk. */
  async loadOlderMessages(): Promise<void> {
    const proj = this.project();
    if (!proj) return;
    const startedAt = performance.now();
    const before = this.allTurns().length;
    await this.loadMoreMessages(this.historyWindowConfig.loadMoreMessageCount);
    const after = this.allTurns().length;
    this.emitHistoryWindowEvent({
      name: 'history_window_extended',
      project: proj,
      loadedMessageCount: after,
      durationMs: performance.now() - startedAt,
      requestedMessageCount: this.historyWindowConfig.loadMoreMessageCount,
      addedMessageCount: after - before,
    });
  }

  /** "Another day / week / month" — shifts the target backwards from
   *  the currently-oldest loaded turn by the given delta. */
  stepBackByDays(days: number): void {
    const all = this.allTurns();
    if (all.length === 0) return;
    const oldestMs = new Date(all[0].ts).getTime();
    if (!Number.isFinite(oldestMs)) return;
    const target = new Date(oldestMs - days * 24 * 3600 * 1000).toISOString();
    void this.loadBackTo(target);
  }

  /** "+N messages" step. */
  stepBackByCount(count: number): void {
    void this.loadMoreMessages(count);
  }

  /** "Jump to date…" — load every turn from the chosen day onward. */
  jumpToDate(): void {
    const raw = this.jumpDate();
    if (!raw) return;
    // <input type="date"> gives "YYYY-MM-DD"; treat as start-of-day UTC.
    const target = new Date(raw + 'T00:00:00Z').toISOString();
    void this.loadBackTo(target);
  }

  /** "Jump to start" — irreversibly load everything. Confirmed when
   *  total exceeds the soft threshold so a misclick on a giant chat
   *  cannot freeze the UI. */
  async jumpToStart(): Promise<void> {
    const total = this.totalCount();
    if (total != null && total > this.historyWindowConfig.jumpToStartConfirmMessageCount) {
      const ok = await this.confirmDialog.confirm({
        title: 'Load entire chat history?',
        message: `Load all ${total.toLocaleString('en-US')} messages? This may take a moment.`,
        confirmLabel: 'Load all',
        cancelLabel: 'Cancel',
        kind: 'primary',
      });
      if (!ok) return;
    }
    void this.loadMoreMessages(Number.MAX_SAFE_INTEGER);
  }

  onJumpDateInput(event: Event): void {
    const v = (event.target as HTMLInputElement | null)?.value ?? '';
    this.jumpDate.set(v);
  }

  formatTs(iso: string): string {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  private emitHistoryWindowEvent(
    event: Pick<
      ChatHistoryWindowEvent,
      | 'name'
      | 'project'
      | 'loadedMessageCount'
      | 'durationMs'
      | 'requestedMessageCount'
      | 'addedMessageCount'
      | 'error'
    >,
  ): void {
    this.historyWindowEvent.emit({
      ...event,
      totalMessageCount: this.totalCount(),
      hidesOlderMessages: this.ageBoundaryHidden(),
      maximumReached: this.maximumWindowReached(),
    });
  }
}
