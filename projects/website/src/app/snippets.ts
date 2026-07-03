/**
 * Static code snippets for the docs section. Content mirrors the library
 * READMEs (root + projects/coding-agent-chat/README.md) — keep them in sync
 * when the public API moves.
 */

export const SNIPPET_INSTALL = `npm install @coding-agent/chat
# peer deps: @angular/core, @angular/common, @angular/forms (>=21 <22), rxjs ~7.8`;

export const SNIPPET_PROVIDE = `// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideCodingAgentChat } from '@coding-agent/chat';

export const appConfig: ApplicationConfig = {
  providers: [
    // Every seam defaults to a safe no-op — call without options to start.
    provideCodingAgentChat(),
  ],
};`;

export const SNIPPET_RENDER = `// any component
import { ConversationViewComponent } from '@coding-agent/chat/conversation';
import type { ConversationEvent } from '@coding-agent/chat/core';

@Component({
  imports: [ConversationViewComponent],
  template: '<cac-conversation-view [events]="events()" />',
})
export class RunView {
  readonly events = signal<readonly ConversationEvent[]>([]);
}`;

export const SNIPPET_SEAM_PROVIDE = `// Light seams up from your bootstrap providers — both bind via useExisting,
// so a providedIn: 'root' service shares its instance with the rest of the app.
provideCodingAgentChat({
  taskReferences: TaskReferenceNavigationService, // implements ChatTaskReferenceProvider
  mediaLightbox: MediaLightboxService,            // implements ChatMediaLightbox
});`;

export const SNIPPET_SEAM_HISTORY = `// The history entry point adds two more seams, provided directly:
import { CHAT_HISTORY_CONFIRM, PROJECT_CHAT_DATA_SOURCE } from '@coding-agent/chat/history';

providers: [
  // scroll/search/stats/turn transport behind <cac-project-chat-list>
  { provide: PROJECT_CHAT_DATA_SOURCE, useClass: MyProjectChatDataSource },
  // guard prompt before loading an entire deep history (defaults to auto-confirm)
  { provide: CHAT_HISTORY_CONFIRM, useClass: MyHistoryConfirm },
];`;

export const SNIPPET_DATA_SOURCE = `// The seam is four read methods — this page implements it in-memory.
export interface ProjectChatDataSource {
  scroll(project: string, request: ProjectChatScrollRequest): Observable<ProjectChatScrollResponse>;
  search(project: string, query: string, limit: number): Observable<ProjectChatSearchResponse>;
  stats(project: string): Observable<ProjectChatStatsResponse>;
  turn(project: string, turnId: string): Observable<ProjectChatTurnResponse>;
}`;

export const SNIPPET_THEME = `/* styles.scss — optional drop-in stylesheet with the studio look */
@import '@coding-agent/chat/theme/cac-theme.css';

/* Dark by default. Light theme via an attribute on any parent: */
/* <html data-studio-theme="light"> */`;

export const SNIPPET_CORE_ONLY = `// Zero-Angular kernel: backends, SSR and tests can import the wire
// contract + projection without pulling in the renderer.
import { projectConversation } from '@coding-agent/chat/core';
import type { ConversationEvent } from '@coding-agent/chat/core';

// Raw evidence in (CLI log lines, run timeline, tokens, screenshots, commits) —
// a flat, ordered ConversationEvent[] out.
const events: ConversationEvent[] = projectConversation({ source: jobId, lines });`;
