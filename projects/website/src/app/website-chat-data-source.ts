/**
 * In-memory implementation of the `PROJECT_CHAT_DATA_SOURCE` host seam that
 * backs the website's `<cac-project-chat-list>` demo.
 *
 * It honours the full seam contract with nothing but a fixture array:
 * `scroll` pages by exclusive ts cursor (newest first, like the reference
 * backend), `search` returns substring hits with `<b>…</b>` snippet markers,
 * `stats` feeds the headline counts and `turn` resolves a single turn by id.
 * Swap this class for an HTTP service and the component doesn't change.
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

/** A day in the life of a project, oldest first — 28 fixture turns. */
const SEED: readonly Seed[] = [
  ['user', 'turn', 'Morning! Priorities today: the palette fuzzy search bug, then the release notes.'],
  ['orchestrator', 'turn', 'Queued `palette-fuzzy-search` into 3-progress; Claude picks it up next.'],
  ['claude', 'turn', 'Reading the palette module — matching is a case-folded `includes()`, no typo tolerance.'],
  ['agent', 'event-tool-call', 'Tool burst: 4 reads · 3 searches · npx vitest run palette (pass).'],
  ['claude', 'turn', 'Plan: subsequence scorer with word-start bonuses, then specs for typos and ranking.'],
  ['agent', 'event-tool-call', 'Edit palette-filter.ts · Edit palette-filter.spec.ts · npx vitest run palette (11 pass).'],
  ['claude', 'turn', 'Fuzzy matching landed. `fuzy` finds "Fuzzy search settings" first; 11 specs green.'],
  ['orchestrator', 'event-decision', 'Complete — typo repro verified, ranking spec-guarded. Moving to 4-auto-review.'],
  ['supervisor', 'event-watchdog', 'Quiet for 80 s during the vitest run — resumed on its own.'],
  ['orchestrator', 'turn', 'Auto-review passed. `palette-fuzzy-search` is in 5-human-review.'],
  ['user', 'turn', 'Verified in the app — nice. Does the scorer handle transposed letters too?'],
  ['claude', 'turn', 'Transpositions match as long as the letters stay a subsequence; the spec `finds "grep" for "gerp"` covers it.'],
  ['user', 'turn', 'Approve. Next up: draft the release notes for 0.4.0.'],
  ['orchestrator', 'turn', 'Created `release-notes-0.4.0` and queued it; estimated one run.'],
  ['codex', 'turn', 'Taking `release-notes-0.4.0`: collecting merged PRs and changelog fragments first.'],
  ['agent', 'event-tool-call', 'Tool burst: 8 reads · 2 searches — git log --oneline v0.3.0..HEAD.'],
  ['codex', 'turn', 'Draft ready: 14 changes grouped into Features / Fixes / Internal. Fuzzy search is the headline.'],
  ['orchestrator', 'event-rate-limit', 'Rate limit · five-hour · allowed · reset in 2.7 h.'],
  ['user', 'turn', 'Headline works. Add an upgrade note about the renamed filter API.'],
  ['codex', 'turn', 'Upgrade note added: `paletteFilter()` → `scoreMatch()` with a two-line migration snippet.'],
  ['orchestrator', 'event-update', 'Nightly build finished: docs preview deployed to staging.'],
  ['gemini', 'turn', 'Reviewing the notes — suggest linking the fuzzy-search spec file as evidence.'],
  ['codex', 'turn', 'Linked. Release notes moved to review with all evidence attached.'],
  ['orchestrator', 'event-task', 'Task `release-notes-0.4.0` moved to 4-auto-review.'],
  ['user', 'turn', 'Great day. Anything left before we tag 0.4.0?'],
  ['orchestrator', 'turn', 'Nothing blocking: two tasks in human review, zero failures, token budget at 41%.'],
  ['claude', 'turn', 'Suggest tagging tomorrow morning so the nightly soak run covers the new scorer.'],
  ['user', 'turn', 'Agreed — tag after the soak run. See you tomorrow.'],
];

const BASE_MS = Date.UTC(2026, 6, 2, 6, 0, 0);
const STEP_MS = 41 * 60_000;

export const WEBSITE_PROJECT_CHAT_TURNS: readonly ProjectChatTurn[] = SEED.map(
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
export class WebsiteProjectChatDataSource implements ProjectChatDataSource {
  /** Oldest-first substrate the scroll/search endpoints work against. */
  private readonly turns = [...WEBSITE_PROJECT_CHAT_TURNS].sort((a, b) =>
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
