import { EnvironmentProviders, Provider, Type, makeEnvironmentProviders } from '@angular/core';

import { CHAT_TASK_REFERENCE_PROVIDER, ChatTaskReferenceProvider } from '@coding-agent/chat/markdown';
import { CHAT_MEDIA_LIGHTBOX, ChatMediaLightbox } from '@coding-agent/chat/shared';

/**
 * Host wiring for the optional library seams. Every seam has a safe no-op
 * default (task keys render unlinked, images do not zoom), so the options —
 * and the call itself — are only needed to light a seam up.
 */
export interface CodingAgentChatOptions {
  /**
   * Host service supplying task references for markdown auto-linking and
   * handling navigation when one is clicked. Bound via `useExisting`, so a
   * `providedIn: 'root'` service shares its instance with the rest of the app.
   */
  taskReferences?: Type<ChatTaskReferenceProvider>;
  /**
   * Host service that owns the click-to-enlarge image overlay (modal stack,
   * focus trap). Bound via `useExisting` like {@link taskReferences}.
   */
  mediaLightbox?: Type<ChatMediaLightbox>;
}

/**
 * The single integration point for host applications:
 *
 * ```ts
 * bootstrapApplication(AppComponent, {
 *   providers: [
 *     provideCodingAgentChat({
 *       taskReferences: TaskReferenceNavigationService,
 *       mediaLightbox: MediaLightboxService,
 *     }),
 *   ],
 * });
 * ```
 *
 * Calling it with no options (or not at all) leaves every seam on its no-op
 * default — the renderer components work without any host wiring.
 */
export function provideCodingAgentChat(options: CodingAgentChatOptions = {}): EnvironmentProviders {
  const providers: Provider[] = [];
  if (options.taskReferences) {
    providers.push({ provide: CHAT_TASK_REFERENCE_PROVIDER, useExisting: options.taskReferences });
  }
  if (options.mediaLightbox) {
    providers.push({ provide: CHAT_MEDIA_LIGHTBOX, useExisting: options.mediaLightbox });
  }
  return makeEnvironmentProviders(providers);
}
