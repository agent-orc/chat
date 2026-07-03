import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/ssr';

import { appConfig } from './app.config';

/**
 * Server-side (prerender) config: the shared client config plus the
 * platform-server renderer. The site has a single route ('/'), so the build
 * runs in `outputMode: "static"` and emits fully prerendered HTML — no
 * runtime server involved.
 */
const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering()],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
