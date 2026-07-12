/**
 * Static code snippets for the docs section. Content mirrors the library
 * READMEs (root + projects/coding-agent-chat/README.md) — keep them in sync
 * when the public API moves.
 */

export const SNIPPET_INSTALL = `npm install coding-agent-chat
# peer deps: @angular/core, @angular/common, @angular/forms (>=21 <22), rxjs ~7.8`;

export const SNIPPET_PROVIDE = `// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideCodingAgentChat } from 'coding-agent-chat';

export const appConfig: ApplicationConfig = {
  providers: [
    // Every integration point has a safe default.
    provideCodingAgentChat(),
  ],
};`;

export const SNIPPET_RENDER = `// any component
import { ConversationViewComponent } from 'coding-agent-chat/conversation';
import type { ConversationEvent } from 'coding-agent-chat/core';

@Component({
  imports: [ConversationViewComponent],
  template: '<cac-conversation-view [events]="events()" />',
})
export class RunView {
  readonly events = signal<readonly ConversationEvent[]>([]);
}`;

export const SNIPPET_SEAM_PROVIDE = `// Both services bind via useExisting and retain their root instances.
provideCodingAgentChat({
  taskReferences: TaskReferenceNavigationService, // implements ChatTaskReferenceProvider
  mediaLightbox: MediaLightboxService,            // implements ChatMediaLightbox
});`;

export const SNIPPET_SEAM_HISTORY = `// The history entry point adds two more seams, provided directly:
import { CHAT_HISTORY_CONFIRM, PROJECT_CHAT_DATA_SOURCE } from 'coding-agent-chat/history';

providers: [
  // scroll/search/stats/turn transport behind <cac-project-chat-list>
  { provide: PROJECT_CHAT_DATA_SOURCE, useClass: MyProjectChatDataSource },
  // guard prompt before loading an entire deep history (defaults to auto-confirm)
  { provide: CHAT_HISTORY_CONFIRM, useClass: MyHistoryConfirm },
];`;

export const SNIPPET_DATA_SOURCE = `// Four read methods. This page implements them in memory.
export interface ProjectChatDataSource {
  scroll(project: string, request: ProjectChatScrollRequest): Observable<ProjectChatScrollResponse>;
  search(project: string, query: string, limit: number): Observable<ProjectChatSearchResponse>;
  stats(project: string): Observable<ProjectChatStatsResponse>;
  turn(project: string, turnId: string): Observable<ProjectChatTurnResponse>;
}`;

export const SNIPPET_THEME = `/* styles.scss */
@import 'coding-agent-chat/theme/cac-theme.css';`;

export const SNIPPET_THEME_SCOPE = `<!-- Dark is the default. Use "dark" to force it. -->
<html lang="en" data-studio-theme="light">
  ...
</html>`;

export const SNIPPET_THEME_OVERRIDE = `/* styles.scss, after the theme import */
:root {
  --studio-accent: #7c3aed;
  --studio-on-accent: #ffffff;
  --studio-accent-2: #0f766e;
}`;

export const SNIPPET_CORE_ONLY = `// Angular-free core for backends, SSR, and tests.
// contract + projection without pulling in the renderer.
import { projectConversation } from 'coding-agent-chat/core';
import type { ConversationEvent } from 'coding-agent-chat/core';

// Convert CLI lines, timeline data, tokens, screenshots, and commits
// into an ordered ConversationEvent[].
const events: ConversationEvent[] = projectConversation({ source: jobId, lines });`;
