/**
 * In-memory implementation of the `PROJECT_CHAT_DATA_SOURCE` host seam.
 *
 * Demonstrates the seam contract with a fixed array of fixture turns:
 * `scroll` pages by exclusive ts cursor (newest first, as the reference
 * backend does), `search` returns substring hits with `<b>…</b>` snippet
 * markers, `stats` feeds the step-load headline and `turn` resolves a
 * single turn by id. No backend, no persistence — just the array below.
 */

import { Injectable } from '@angular/core';
import { EMPTY, Observable, of } from 'rxjs';

import type {
  ProjectChatDataSource,
  ProjectChatScrollRequest,
  ProjectChatScrollResponse,
  ProjectChatSearchHit,
  ProjectChatSearchResponse,
  ProjectChatStatsResponse,
  ProjectChatTurn,
  ProjectChatTurnResponse,
} from '@coding-agent/chat/history';

type Seed = [ProjectChatTurn['author'], ProjectChatTurn['kind'], string];

/** 26 fixture turns spanning roughly a day of project activity. */
const SEED: readonly Seed[] = [
  ['user', 'turn', 'Kick off the settings revamp: theme toggle first, then density options.'],
  ['orchestrator', 'turn', 'Queued `settings-theme-toggle` into 3-progress; Claude picks it up next.'],
  ['claude', 'turn', 'Reading the settings module. The theme service already exposes a `studioTheme` signal.'],
  ['agent', 'event-tool-call', 'Tool burst: 5 reads · 2 searches across src/app/settings.'],
  ['claude', 'turn', 'Plan: bind the toggle to `data-studio-theme` on the document root, persist to localStorage.'],
  ['agent', 'event-tool-call', 'Edit settings.component.ts · Edit theme.service.ts · npx vitest run settings (pass).'],
  ['claude', 'turn', 'Toggle implemented and covered by four specs. Screenshots attached to the task.'],
  ['orchestrator', 'event-decision', 'Reissue · Open items — persistence across reloads is still missing.'],
  ['claude', 'turn', 'Persistence added; the stored theme is re-applied before first paint.'],
  ['supervisor', 'event-watchdog', 'Quiet for 95 s during the vitest run — resumed on its own.'],
  ['orchestrator', 'turn', 'Auto-review passed. Moving `settings-theme-toggle` to 5-human-review.'],
  ['user', 'turn', 'Looks good in dark mode. Does the light palette hold up in the composer too?'],
  ['claude', 'turn', 'Yes — the composer reads the same studio tokens; light screenshots are in results/.'],
  ['user', 'turn', 'Approve. Next: wire the project chat history behind the new data-source seam.'],
  ['orchestrator', 'turn', 'Created `project-chat-datasource` and queued it; estimated one run.'],
  ['codex', 'turn', 'Taking `project-chat-datasource`: implementing scroll paging by ts cursor first.'],
  ['agent', 'event-tool-call', 'Tool burst: 8 reads · 3 edits · 1 command — npm run build (pass).'],
  ['codex', 'turn', 'Scroll + stats are done. Search returns BM25-ish ranked hits with <b> snippet markers.'],
  ['orchestrator', 'event-rate-limit', 'Rate limit · five-hour · allowed · reset in 3.2 h.'],
  ['codex', 'turn', 'Deep-history threshold verified: silent backfill stops at 1000 turns, panel takes over.'],
  ['orchestrator', 'event-update', 'Nightly deploy finished: taskboard@2026.07.01 is live on staging.'],
  ['user', 'turn', 'Great. Can we demo the whole thing in a small playground app?'],
  ['orchestrator', 'turn', 'Spawning `conversation-lab` playground: conversation view, composer, history list.'],
  ['gemini', 'turn', 'Reviewing the playground plan — suggest a dark/light toggle to exercise the theme.'],
  ['claude', 'turn', 'Playground scaffolded. Composer submits append local user turns; no backend.'],
  ['orchestrator', 'event-task', 'Task `conversation-lab` moved to 4-auto-review.'],
];

const BASE_MS = Date.UTC(2026, 6, 1, 6, 0, 0);
const STEP_MS = 47 * 60_000;

export const LAB_PROJECT_CHAT_TURNS: readonly ProjectChatTurn[] = SEED.map(
  ([author, kind, body], i) => ({
    turnId: `turn-${String(i + 1).padStart(3, '0')}`,
    author,
    kind,
    ts: new Date(BASE_MS + i * STEP_MS).toISOString(),
    refs: null,
    body,
  }),
);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class InMemoryProjectChatDataSource implements ProjectChatDataSource {
  /** Oldest-first substrate the scroll/search endpoints work against. */
  private readonly turns = [...LAB_PROJECT_CHAT_TURNS].sort((a, b) =>
    a.ts.localeCompare(b.ts),
  );

  scroll(
    project: string,
    request: ProjectChatScrollRequest,
  ): Observable<ProjectChatScrollResponse> {
    const limit = request.limit ?? 100;
    let direction: ProjectChatScrollResponse['direction'];
    let page: ProjectChatTurn[];
    if (request.before) {
      direction = 'before';
      page = this.turns.filter((t) => t.ts < request.before!).slice(-limit);
    } else if (request.after) {
      direction = 'after';
      page = this.turns.filter((t) => t.ts > request.after!).slice(0, limit);
    } else {
      direction = 'tail';
      page = this.turns.slice(-limit);
    }
    // Reference-backend convention: pages arrive newest first; the list flips them.
    return of({ project, direction, turns: [...page].reverse() });
  }

  search(
    project: string,
    query: string,
    limit: number,
  ): Observable<ProjectChatSearchResponse> {
    const q = query.trim().toLowerCase();
    const results: ProjectChatSearchHit[] = [];
    if (q.length > 0) {
      for (const turn of this.turns) {
        const haystack = turn.body.toLowerCase();
        const first = haystack.indexOf(q);
        if (first < 0) continue;
        let score = 0;
        for (let i = first; i >= 0; i = haystack.indexOf(q, i + q.length)) score += 1;
        results.push({
          turnId: turn.turnId,
          author: turn.author,
          kind: turn.kind,
          ts: turn.ts,
          snippet: this.snippetFor(turn.body, q, first),
          score,
        });
      }
      results.sort((a, b) => b.score - a.score || b.ts.localeCompare(a.ts));
    }
    return of({ project, results: results.slice(0, Math.max(1, limit)) });
  }

  stats(project: string): Observable<ProjectChatStatsResponse> {
    return of({
      project,
      totalCount: this.turns.length,
      oldestTs: this.turns[0]?.ts ?? null,
      newestTs: this.turns[this.turns.length - 1]?.ts ?? null,
    });
  }

  turn(project: string, turnId: string): Observable<ProjectChatTurnResponse> {
    const turn = this.turns.find((t) => t.turnId === turnId);
    return turn ? of({ project, turn }) : EMPTY;
  }

  private snippetFor(body: string, q: string, firstIndex: number): string {
    const from = Math.max(0, firstIndex - 40);
    const to = Math.min(body.length, firstIndex + q.length + 80);
    const raw =
      (from > 0 ? '…' : '') + body.slice(from, to) + (to < body.length ? '…' : '');
    const escaped = escapeHtml(raw);
    const pattern = new RegExp(escapeRegExp(escapeHtml(q)), 'gi');
    return escaped.replace(pattern, (match) => `<b>${match}</b>`);
  }
}
