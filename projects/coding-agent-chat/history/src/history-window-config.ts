import { InjectionToken } from '@angular/core';

/**
 * Tuning knobs for the project-chat history window.
 *
 * Counts describe messages held by the component, not DOM rows. Rendering is
 * virtualised separately, but the loaded messages still feed phase grouping,
 * the minimap and change detection, so keeping a bounded in-memory window is
 * important even when only a small number of rows are painted.
 */
export interface ChatHistoryWindowConfig {
  /** Enable the age boundary only when the chat contains more than this many messages. */
  messageCountThreshold: number;
  /** Hide messages this many days older than the conversation's newest message. */
  messageAgeDays: number;
  /** Chats at or below this size always load in full, regardless of age. */
  smallChatMessageCount: number;
  /** Number of messages requested when the user confirms "load older messages". */
  loadMoreMessageCount: number;
  /** Hard upper bound for messages retained by one history-list instance. */
  maxWindowMessageCount: number;
  /** Fallback tail size when the host cannot provide chat stats. */
  initialPageMessageCount: number;
  /** Cursor page size used while satisfying an explicit load-more request. */
  pageMessageCount: number;
  /** Distance from the top that counts as reaching the older-history boundary. */
  boundaryTriggerPx: number;
  /** Estimated row height used by the range virtualiser. */
  estimatedRowHeightPx: number;
  /** Extra virtual rows retained above and below the viewport. */
  virtualBufferRows: number;
  /** Ask for confirmation before a jump-to-start above this total size. */
  jumpToStartConfirmMessageCount: number;
}

/** Stable host-observable events emitted by `<cac-project-chat-list>`. */
export type ChatHistoryWindowEventName =
  | 'history_window_initialized'
  | 'history_window_extended'
  | 'history_window_load_failed';

/**
 * Operational context for history-window decisions and user-triggered loads.
 * Hosts can record this output without parsing UI text or library internals.
 */
export interface ChatHistoryWindowEvent {
  name: ChatHistoryWindowEventName;
  project: string;
  loadedMessageCount: number;
  totalMessageCount: number | null;
  hidesOlderMessages: boolean;
  maximumReached: boolean;
  durationMs: number;
  requestedMessageCount?: number;
  addedMessageCount?: number;
  error?: string;
}

/**
 * Defaults selected from the reproducible benchmark in
 * `docs/history-window-benchmark.md`.
 */
export const DEFAULT_CHAT_HISTORY_WINDOW_CONFIG: Readonly<ChatHistoryWindowConfig> =
  Object.freeze({
    messageCountThreshold: 500,
    messageAgeDays: 7,
    smallChatMessageCount: 30,
    loadMoreMessageCount: 1000,
    maxWindowMessageCount: 5000,
    initialPageMessageCount: 100,
    pageMessageCount: 200,
    boundaryTriggerPx: 200,
    estimatedRowHeightPx: 120,
    virtualBufferRows: 50,
    jumpToStartConfirmMessageCount: 2000,
  });

export type ChatHistoryWindowOptions = Partial<ChatHistoryWindowConfig>;

/** Merge host overrides with the safe, benchmarked defaults. */
export function resolveChatHistoryWindowConfig(
  options: ChatHistoryWindowOptions = {},
): Readonly<ChatHistoryWindowConfig> {
  const merged = { ...DEFAULT_CHAT_HISTORY_WINDOW_CONFIG, ...options };
  const positiveIntegerKeys: ReadonlyArray<keyof ChatHistoryWindowConfig> = [
    'messageCountThreshold',
    'messageAgeDays',
    'smallChatMessageCount',
    'loadMoreMessageCount',
    'maxWindowMessageCount',
    'initialPageMessageCount',
    'pageMessageCount',
    'estimatedRowHeightPx',
    'virtualBufferRows',
    'jumpToStartConfirmMessageCount',
  ];
  for (const key of positiveIntegerKeys) {
    if (!Number.isFinite(merged[key]) || merged[key] < 1) {
      throw new RangeError(`historyWindow.${key} must be a positive number`);
    }
    merged[key] = Math.floor(merged[key]);
  }
  if (!Number.isFinite(merged.boundaryTriggerPx) || merged.boundaryTriggerPx < 0) {
    throw new RangeError('historyWindow.boundaryTriggerPx must be zero or greater');
  }
  merged.boundaryTriggerPx = Math.floor(merged.boundaryTriggerPx);
  if (merged.smallChatMessageCount > merged.maxWindowMessageCount) {
    throw new RangeError(
      'historyWindow.smallChatMessageCount cannot exceed maxWindowMessageCount',
    );
  }
  return Object.freeze(merged);
}

/** Public token for hosts that prefer direct provider registration. */
export const CHAT_HISTORY_WINDOW_CONFIG = new InjectionToken<
  Readonly<ChatHistoryWindowConfig>
>('CHAT_HISTORY_WINDOW_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_CHAT_HISTORY_WINDOW_CONFIG,
});
