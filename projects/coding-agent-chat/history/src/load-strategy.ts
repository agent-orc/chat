/**
 * Pure decision function for the chat-history backfill behaviour.
 *
 * Recent window loads eagerly. Scrolling above triggers progressive
 * backfill — but only until the deep-history threshold. Past that, the
 * chat shows an explicit step-load panel and silent infinite scroll
 * stops. The threshold guards the browser: ten thousand turns streamed
 * automatically would freeze layout long before the user notices they
 * dragged the scrollbar too far.
 */

export type LoadAction = 'continue-backfill' | 'show-panel' | 'no-op';

export interface InitialHistoryWindowInput {
  totalCount: number;
  oldestTs: string | null;
  newestTs: string | null;
  messageCountThreshold: number;
  messageAgeDays: number;
  smallChatMessageCount: number;
  maxWindowMessageCount: number;
}

export interface InitialHistoryWindowPlan {
  /** Exclusive lower time cursor. Present only when the old layer is hidden. */
  after?: string;
  /** Maximum number of messages requested for the initial window. */
  limit: number;
  /** True when an explicit user action is required to cross the age boundary. */
  hidesOlderMessages: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Plan the initial request from cheap chat stats. The age is measured from the
 * newest message rather than wall-clock time: an inactive chat still opens on
 * its latest days instead of showing an empty window.
 */
export function planInitialHistoryWindow(
  input: InitialHistoryWindowInput,
): InitialHistoryWindowPlan {
  const total = Math.max(0, Math.floor(input.totalCount));
  const fullLimit = Math.max(1, Math.min(total || 1, input.maxWindowMessageCount));
  if (total <= input.smallChatMessageCount || total <= input.messageCountThreshold) {
    return { limit: fullLimit, hidesOlderMessages: false };
  }

  const oldestMs = input.oldestTs ? Date.parse(input.oldestTs) : Number.NaN;
  const newestMs = input.newestTs ? Date.parse(input.newestTs) : Number.NaN;
  if (!Number.isFinite(oldestMs) || !Number.isFinite(newestMs)) {
    return { limit: fullLimit, hidesOlderMessages: false };
  }
  const cutoffMs = newestMs - input.messageAgeDays * DAY_MS;
  if (oldestMs >= cutoffMs) {
    return { limit: fullLimit, hidesOlderMessages: false };
  }
  return {
    // `after` is exclusive. Shift by one millisecond so a message exactly D
    // days old remains in the recent layer; only strictly older messages hide.
    after: new Date(cutoffMs - 1).toISOString(),
    limit: input.maxWindowMessageCount,
    hidesOlderMessages: true,
  };
}

export interface LoadStrategyInput {
  /** Number of turns currently loaded in the FE. */
  loadedCount: number;
  /** Whether the server is known to have more turns above the loaded range. */
  hasMoreOlder: boolean;
  /** True while a backfill request is already in flight. */
  isLoading: boolean;
  /** True when the viewport is within the trigger zone at the top. */
  isNearTop: boolean;
  /** Loaded-count past which the step-load panel takes over. */
  threshold: number;
  /** An age boundary was deliberately applied to the initial request. */
  hidesOlderMessages?: boolean;
  /** The configured in-memory maximum has been reached. */
  maximumReached?: boolean;
}

export function decideLoadAction(input: LoadStrategyInput): LoadAction {
  if (!input.hasMoreOlder) return 'no-op';
  if (input.isLoading) return 'no-op';
  if (input.maximumReached) return 'show-panel';
  if (input.hidesOlderMessages) return 'show-panel';
  if (input.loadedCount >= input.threshold) return 'show-panel';
  if (!input.isNearTop) return 'no-op';
  return 'continue-backfill';
}

/**
 * Format a "you are viewing N of M, going back to <date>" sentence for
 * the step-load panel. Kept pure so the spec can lock the wording.
 */
export function formatLoadedSummary(
  loaded: number,
  total: number | null,
  oldestIso: string | null
): string {
  const pieces: string[] = [];
  if (total != null && total > 0) {
    pieces.push(`Viewing ${loaded.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} messages.`);
  } else {
    pieces.push(`Viewing ${loaded.toLocaleString('en-US')} messages.`);
  }
  if (oldestIso) {
    try {
      const d = new Date(oldestIso);
      const back = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
      pieces.push(`Oldest loaded: ${back}.`);
    } catch {
      // fall through; bad date strings are not user-facing here
    }
  }
  return pieces.join(' ');
}
