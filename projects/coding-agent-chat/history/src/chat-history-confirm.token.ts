import { InjectionToken } from '@angular/core';

/** One confirmation prompt. Mirrors the reference host's dialog options. */
export interface ChatHistoryConfirmRequest {
  title: string;
  message: string;
  /** Optional extra line rendered under the message (e.g. an item name). */
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  kind?: 'primary' | 'danger';
}

/**
 * Optional host seam for destructive-ish confirmations ("load the
 * entire 47k-message history?"). The library only decides *when* a
 * prompt is warranted; the host owns the dialog surface (modal stack,
 * focus trap, Escape ordering). Defaults to auto-confirm so the flows
 * still work without host wiring — bind your own dialog service to add
 * the guard rail.
 */
export interface ChatHistoryConfirm {
  confirm(request: ChatHistoryConfirmRequest): Promise<boolean>;
}

export const CHAT_HISTORY_CONFIRM = new InjectionToken<ChatHistoryConfirm>(
  'CHAT_HISTORY_CONFIRM',
  {
    providedIn: 'root',
    factory: (): ChatHistoryConfirm => ({ confirm: () => Promise.resolve(true) }),
  },
);
