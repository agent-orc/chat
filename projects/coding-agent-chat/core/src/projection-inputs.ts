/**
 * Lib-owned minimal input interfaces for the conversation projection.
 *
 * `projectConversation` consumes only these small structural shapes — never a
 * host's richer model types. A host maps its own CLI output lines, run
 * timeline, token summary, task info and git changes down to these at the call
 * site, keeping the library free of any host-model import (the projection now
 * owns its inputs).
 *
 * Naming: no `Job…` names in new library code (the domain term is `Task`); the
 * `…Lite` suffix marks "the minimal subset the projection reads", not a full
 * host type.
 */

/** One raw CLI activity-log line. Structurally identical to the host shape. */
export interface CliOutputLine {
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Originating stream: `stdout` | `stderr` | `user` | `orchestrator` | `supervisor` | `system`. */
  stream: string;
  text: string;
}

/** One changed file in a commit. Mirrors a git numstat row. */
export interface GitFileChange {
  /** Single-letter git diff status (A/M/D/R/C). */
  status: string;
  path: string;
  added: number;
  removed: number;
}

/** The subset of a run record the projection reads. */
export interface RunInfoLite {
  index: number;
  /** `start` | `continue` | `recovery` | `restart` | `reissue`. */
  intent: string;
  startedAt: string;
  /** `running` | `completed` | `failed` | `cancelled` | `unknown`. */
  status: string;
  cli: string | null;
  exitCode: number | null;
  durationSeconds: number | null;
  capturedSessionId: string | null;
  /** 1-based inclusive line bounds into the source log, when known. */
  lineStart: number | null;
  lineEnd: number | null;
}

/** The subset of a run timeline the projection reads. */
export interface RunTimelineLite {
  runCount: number;
  runs: readonly RunInfoLite[];
}

/** The subset of a task token summary the projection reads. */
export interface TokenSummaryLite {
  inputTokens: number;
  outputTokens: number;
  /** ISO timestamp of the latest token update, when known. */
  lastUpdate?: string | null;
}

/** The subset of task info the projection reads for the task marker + summary. */
export interface TaskInfoLite {
  id: string;
  title: string;
  /** Lane id (`3-progress`, `4-auto-review`, ...). */
  state: string;
  createdAt?: string | null;
  lastActivity?: string | null;
  tokenSummary?: TokenSummaryLite | null;
}
