import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCodingAgentChat } from 'coding-agent-chat';
import { CHAT_MEDIA_LIGHTBOX } from 'coding-agent-chat/shared';

import { LabLightboxService } from './lab-lightbox.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Single library integration point; called without options so every seam
    // stays on its safe default (task refs unlinked).
    provideCodingAgentChat({
      metadata: {
        capabilities: {
          'codex-exec': {
            fields: [
              'model',
              'provider',
              'thinkingLevel',
              'tokens.input',
              'tokens.cachedInput',
              'tokens.output',
              'tokens.reasoning',
              'cost.amount',
              'cost.currency',
              'cost.priceSource',
              'durations.totalMs',
            ],
          },
          'chat-session': {
            fields: [
              'model',
              'tokens.input',
              'tokens.output',
              'cost.amount',
              'cost.currency',
              'durations.totalMs',
            ],
          },
        },
      },
    }),
    // Host seam for click-to-enlarge: the library reports the activated image,
    // this service + the App overlay render the zoom preview.
    { provide: CHAT_MEDIA_LIGHTBOX, useExisting: LabLightboxService },
  ],
};
