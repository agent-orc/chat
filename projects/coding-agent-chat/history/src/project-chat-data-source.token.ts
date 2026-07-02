import { InjectionToken } from '@angular/core';
import { EMPTY, Observable, of } from 'rxjs';

import type {
  ProjectChatScrollResponse,
  ProjectChatSearchResponse,
  ProjectChatStatsResponse,
  ProjectChatTurnResponse,
} from './project-chat.model';

/** Query for one scroll page. `before`/`after` are exclusive ts cursors. */
export interface ProjectChatScrollRequest {
  before?: string;
  after?: string;
  limit?: number;
}

/**
 * The single hard host seam for the virtualised history list. The list
 * owns *when* to load (initial tail, near-top backfill, step-load
 * paging, search, anchored jumps) but never *how*: the host implements
 * this contract over its transport (HTTP, SignalR replay, in-memory
 * store) and provides it under {@link PROJECT_CHAT_DATA_SOURCE}.
 *
 * Response conventions match the reference backend: `scroll` returns
 * pages in reverse-chronological order (newest first — the list flips
 * them), `search` returns BM25-ranked hits with `<b>...</b>` snippet
 * markers, `stats` feeds the step-load headline and `turn` resolves a
 * single turn so a search hit outside the loaded window can be jumped
 * to.
 */
export interface ProjectChatDataSource {
  scroll(
    project: string,
    request: ProjectChatScrollRequest,
  ): Observable<ProjectChatScrollResponse>;
  search(
    project: string,
    query: string,
    limit: number,
  ): Observable<ProjectChatSearchResponse>;
  stats(project: string): Observable<ProjectChatStatsResponse>;
  turn(project: string, turnId: string): Observable<ProjectChatTurnResponse>;
}

/**
 * Defaults to an empty-history no-op so the list renders (with its
 * empty state) without any host wiring: scroll/search complete with
 * empty pages, stats reports zero and `turn` never emits.
 */
export const PROJECT_CHAT_DATA_SOURCE = new InjectionToken<ProjectChatDataSource>(
  'PROJECT_CHAT_DATA_SOURCE',
  {
    providedIn: 'root',
    factory: (): ProjectChatDataSource => ({
      scroll: (project) =>
        of<ProjectChatScrollResponse>({ project, direction: 'tail', turns: [] }),
      search: (project) => of<ProjectChatSearchResponse>({ project, results: [] }),
      stats: (project) =>
        of<ProjectChatStatsResponse>({
          project,
          totalCount: 0,
          oldestTs: null,
          newestTs: null,
        }),
      turn: () => EMPTY,
    }),
  },
);
