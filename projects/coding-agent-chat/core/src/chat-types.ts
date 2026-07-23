/**
 * Shared types for the reusable <app-chat> component.
 *
 * The chat is intentionally presentational: it owns draft text, draft
 * attachments, paste/drop handling, and submit emission, but it does not
 * speak to the backend. Callers feed it a `messages` list and react to
 * `submit`. This keeps it usable for any chat surface (orchestrator side
 * sheet today, per-task chat later).
 */

export type ChatRole = 'user' | 'agent' | 'orchestrator' | 'system';

interface ChatAttachmentBase {
  /** Display label (alt text). */
  alt: string;
  /**
   * Optional transient rendering URL. This is deliberately not the durable
   * identity of an attachment: hosts may recreate it after every restart
   * from `relativePath` with their normal authenticated media route.
   */
  url?: string;
  /** True while the file is staged client-side. */
  pending?: boolean;
}

export interface ChatTurnProvenance {
  cli?: string | null;
  provider?: string | null;
  model?: string | null;
  thinkingLevel?: string | null;
  durationMs?: number | null;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    cost?: number;
  } | null;
  taskKey?: string | null;
  taskId?: string | null;
  project?: string | null;
  contextKey?: string | null;
  contextType?: string | null;
  turnId?: string | null;
  sessionId?: string | null;
  runId?: string | number | null;
  navigationContext?: readonly string[];
}

/**
 * Versioned, durable attachment identity stored in a ChatMessage.
 *
 * `relativePath` is relative to the project root and always uses `/`
 * separators. `contentHash` is both an integrity check and the stable file
 * name. The optional `url` is presentation-only and must not be archived as
 * the sole way to find the content.
 */
export interface ChatStoredAttachmentRef extends ChatAttachmentBase {
  kind: 'stored';
  schemaVersion: 1;
  relativePath: string;
  contentHash: `sha256:${string}`;
  mime: string;
  sizeBytes: number;
}

/**
 * Pre-contract attachment shape. It remains part of the public union so old
 * archives deserialize without a flag day. Use ChatAttachmentContract.migrate
 * to copy a readable project-relative legacy file into durable storage.
 */
export interface ChatLegacyAttachmentRef extends ChatAttachmentBase {
  kind?: 'legacy';
  /**
   * Historical display URL/path. Project-relative values and data URLs can be
   * migrated; `blob:` and remote URLs cannot be recovered after a restart.
   */
  url: string;
  mime?: string;
}

/** Explicit tombstone used when an archived attachment cannot be recovered. */
export interface ChatUnavailableAttachmentRef extends ChatAttachmentBase {
  kind: 'unavailable';
  reason: string;
  /** Original archived path/URL, retained for diagnostics and manual repair. */
  legacyUrl?: string;
}

export type ChatAttachmentRef =
  | ChatStoredAttachmentRef
  | ChatLegacyAttachmentRef
  | ChatUnavailableAttachmentRef;

export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** Plain text or Markdown. Agent / orchestrator / system get rendered as Markdown. */
  text: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  attachments?: ChatAttachmentRef[];
  /**
   * True while the agent reply is streaming or the message is still being
   * persisted. Renders a subtle pulsing indicator.
   */
  pending?: boolean;
  /** When set, the message bubble shows an inline error footer. */
  error?: string;
  /** Immutable provenance / turn metadata. Omit for legacy turns. */
  provenance?: ChatTurnProvenance | null;
  /**
   * `bubble` (default) renders the normal chat bubble. `notice` renders a
   * centered divider line instead — for meta events that belong in the
   * chronology but are not conversation turns, e.g. "Model changed:
   * Sonnet 5 → Opus 4.8". Notice text is rendered as plain text.
   */
  presentation?: 'bubble' | 'notice';
}

export interface ChatDraftAttachment {
  id: string;
  file: File;
  alt: string;
  /** Object URL for the preview thumbnail. Caller / component is responsible for revoking. */
  previewUrl: string;
}

export interface ChatSubmitEvent {
  text: string;
  attachments: ChatDraftAttachment[];
}

/**
 * Stable location context for a chat composer.
 *
 * Hosts supply this when the next message is scoped to a particular project
 * surface and a more precise detail such as a task or view.
 * The chat renders it in its standard composer footer, avoiding a
 * host-specific projected footer workaround.
 */
export interface ChatComposerContext {
  project: string;
  surface: string;
  detail: string;
}

/**
 * One button rendered in the chat composer's toolbar row above the
 * textarea. Lets a host plug in chat-surface-specific affordances
 * (`#` reference, `@` mention, fork-thread, search) without baking
 * any of them into the shared component. The `id` round-trips through
 * the `toolbarAction` output so the host can dispatch on it.
 */
export interface ChatToolbarItem {
  id: string;
  /** Single glyph / emoji / short text rendered as the button face. */
  glyph: string;
  /** Tooltip + aria-label. */
  label: string;
  /** `icon` (default): square 24x24-ish button. `pill`: text label. */
  variant?: 'icon' | 'pill';
  disabled?: boolean;
}

/**
 * Inline event card surfaced inside the chat timeline. The chat is
 * becoming the primary product surface; events from background CLIs
 * (tool calls, watchdog warnings, rate-limit pills, etc.) belong woven
 * into the chronology, not in a separate toast or panel.
 *
 * The chat component is purely presentational: callers feed it an
 * `events` list and the chat merges it with `messages` by timestamp.
 * Persistence and the live data source live elsewhere (Slice D backs
 * this with per-month markdown files + the chat search index; here we
 * pin the rendering contract so a host can already plug in events).
 */
export type ChatEventKind =
  | 'tool-call'
  | 'watchdog'
  | 'rate-limit'
  | 'decision'
  | 'update'
  | 'task'
  /**
   * The model/agent session was interrupted (network drop, retry, etc.)
   * and recovery succeeded. Detail typically names how many turns were
   * lost. Renders with a green accent.
   */
  | 'session-recovered'
  /**
   * The orchestrator's working memory was refreshed from project-state
   * sources. Detail typically lists the sources (status files, roadmap,
   * etc.). Renders with a blue accent.
   */
  | 'memory-refreshed';

export interface ChatEvent {
  id: string;
  kind: ChatEventKind;
  /** ISO 8601 timestamp. Used to merge with messages chronologically. */
  timestamp: string;
  /** One-line summary shown in the inline card head. Plain text. */
  summary: string;
  /**
   * Optional expandable detail. Markdown is rendered the same way as
   * agent turns (line-numbered code blocks for >5 lines, inline code,
   * links with safe rels, etc). Leave empty when the summary alone is
   * enough.
   */
  detail?: string;
  /** Higher severity flips the card chrome to the error-coloured palette. */
  severity?: 'info' | 'warn' | 'error';
  /**
   * Optional inline action button rendered next to the timestamp in the
   * card head. The chat surface emits {@link ChatComponent.eventAction}
   * with this event's id so the host can navigate without a page reload
   * (Slice E click-through to the new bug task's detail panel).
   */
  actionLabel?: string;
  /**
   * F15: only meaningful for `kind === 'decision'`. Carries the
   * orchestrator's decision subtype (`decision`, `reissue`, `heuristic`,
   * `giveup`) so the inline card can render
   * `"<icon> Orchestrator: <decisionType> - <summary>"` and pick a
   * subtype-specific glyph. Source: `OrchestratorDecisionEvent.decisionType`
   * in the project-conversation projection.
   */
  decisionType?: string;
}
