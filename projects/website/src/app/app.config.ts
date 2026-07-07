import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideCodingAgentChat } from 'coding-agent-chat';

import { WebsiteLightboxService } from './website-lightbox.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // The page is prerendered (SSG); hydrate the static HTML instead of
    // re-rendering it, and replay any clicks that happened before hydration.
    provideClientHydration(withEventReplay()),
    // Single library integration point: the site provides the image lightbox
    // (the rendering showcase demos click-to-enlarge); the other seams stay
    // on their safe no-op defaults.
    provideCodingAgentChat({ mediaLightbox: WebsiteLightboxService }),
  ],
};
