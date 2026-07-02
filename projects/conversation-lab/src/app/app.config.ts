import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCodingAgentChat } from '@coding-agent/chat';
import { PROJECT_CHAT_DATA_SOURCE } from '@coding-agent/chat/history';

import { InMemoryProjectChatDataSource } from './lab-chat-data-source';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Single library integration point; called without options so every seam
    // stays on its safe no-op default (task refs unlinked, no lightbox).
    provideCodingAgentChat(),
    // Host seam for <cac-project-chat-list>: a small in-memory implementation
    // instead of an HTTP backend.
    { provide: PROJECT_CHAT_DATA_SOURCE, useClass: InMemoryProjectChatDataSource },
  ],
};
