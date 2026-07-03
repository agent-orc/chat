import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideCodingAgentChat } from '@coding-agent/chat';
import { PROJECT_CHAT_DATA_SOURCE } from '@coding-agent/chat/history';

import { WebsiteProjectChatDataSource } from './website-chat-data-source';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // The page is prerendered (SSG); hydrate the static HTML instead of
    // re-rendering it, and replay any clicks that happened before hydration.
    provideClientHydration(withEventReplay()),
    // Single library integration point. Called without options, every seam
    // stays on its safe no-op default (task refs unlinked, no lightbox).
    provideCodingAgentChat(),
    // Host seam for <cac-project-chat-list>: the site's in-memory history.
    { provide: PROJECT_CHAT_DATA_SOURCE, useClass: WebsiteProjectChatDataSource },
  ],
};
