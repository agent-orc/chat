/**
 * Project-chat history wire contract. Vendored from the taskboard
 * frontend's `features/project-chat/models/project-chat.model.ts`.
 *
 * One turn returned by the project-chat scroll surface
 * (`/api/projects/{project}/chat/...` in the reference host). Wider
 * author + kind enums than a plain chat message: the history tree
 * carries embedded events (tool-call / watchdog / rate-limit / ...)
 * as first-class records alongside conventional turns.
 */

export interface ProjectChatTurn {
  turnId: string;
  author:
    | 'user'
    | 'orchestrator'
    | 'agent'
    | 'supervisor'
    | 'claude'
    | 'codex'
    | 'gemini';
  kind:
    | 'turn'
    | 'event-tool-call'
    | 'event-watchdog'
    | 'event-rate-limit'
    | 'event-update'
    | 'event-task'
    | 'event-decision';
  ts: string;
  refs?: string[] | null;
  /** Generating model for this historical run, if attributable by the backend. */
  model?: string | null;
  /** Thinking level paired with the generating model. */
  thinkingLevel?: string | null;
  body: string;
}

export interface ProjectChatScrollResponse {
  project: string;
  direction: 'before' | 'after' | 'tail';
  turns: ProjectChatTurn[];
}

export interface ProjectChatSearchHit {
  turnId: string;
  author: ProjectChatTurn['author'];
  kind: ProjectChatTurn['kind'];
  ts: string;
  /** Generating model for this hit's run, when the search backend can attribute it. */
  model?: string | null;
  /** Thinking level paired with the generating model. */
  thinkingLevel?: string | null;
  /** HTML-safe snippet with `<b>...</b>` highlight markers around matched terms. */
  snippet: string;
  score: number;
}

export interface ProjectChatSearchResponse {
  project: string;
  results: ProjectChatSearchHit[];
}

export interface ProjectChatTurnResponse {
  project: string;
  turn: ProjectChatTurn;
}

/**
 * Per-project chat stats. Drives the step-load panel headline
 * ("47,238 messages total, you are viewing 1,000 of them, going back
 * to 2026-04-15").
 */
export interface ProjectChatStatsResponse {
  project: string;
  totalCount: number;
  oldestTs: string | null;
  newestTs: string | null;
}
