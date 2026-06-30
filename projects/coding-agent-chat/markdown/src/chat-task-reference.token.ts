import { InjectionToken, Signal, signal } from '@angular/core';
import type { MarkdownTaskReference } from './markdown-utils';

/**
 * The single hard host seam for markdown task-reference auto-linking. Markdown
 * bodies linkify bare task keys/ids to clickable anchors; the host supplies the
 * current reference set (reactively) and handles navigation when one is
 * clicked. Defaults to no references + no-op navigation so markdown renders
 * correctly with zero host wiring.
 */
export interface ChatTaskReferenceProvider {
  /** Reactive set of task references markdown bodies should auto-link. */
  readonly markdownReferences: Signal<readonly MarkdownTaskReference[]>;
  /** Navigate to a task by its key. Returns true when the host handled it. */
  openTaskKey(taskKey: string | null | undefined): boolean;
}

const NO_TASK_REFERENCES: Signal<readonly MarkdownTaskReference[]> =
  signal<readonly MarkdownTaskReference[]>([]);

export const CHAT_TASK_REFERENCE_PROVIDER =
  new InjectionToken<ChatTaskReferenceProvider>('CHAT_TASK_REFERENCE_PROVIDER', {
    providedIn: 'root',
    factory: (): ChatTaskReferenceProvider => ({
      markdownReferences: NO_TASK_REFERENCES,
      openTaskKey: () => false,
    }),
  });
