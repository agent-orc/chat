/**
 * Contracts for the composer footer controls: model selector, permission
 * select, and context ring. Like the rest of the composer surface these are
 * presentational contracts — the components never talk to a backend. Hosts
 * feed catalogs/usage in via inputs and react to the request/commit outputs.
 */

/** One selectable CLI in the model selector (e.g. Claude Code, Codex). */
export interface ChatCliOption {
  id: string;
  label: string;
  /** Single glyph / emoji rendered before the label. */
  icon?: string;
}

/**
 * One model entry in the selector's catalog. Mirrors the shape a host
 * typically gets from its own model-discovery endpoint; the selector only
 * reads the fields below and ignores anything else.
 */
export interface ChatModelOption {
  id: string;
  /** Display label; falls back to `id` when empty. */
  label?: string;
  /** Marks the entry the CLI uses when no explicit model is set. */
  isDefault?: boolean;
  /** `false` hides the entry from the picker. Absent counts as available. */
  available?: boolean;
  /** Thinking / reasoning levels this model supports. Empty = no selector. */
  thinkingLevels?: readonly string[];
  /** Preselected level when the model is picked. */
  defaultThinkingLevel?: string | null;
}

/** Atomic result of a model-selector commit. `model === ''` means CLI default. */
export interface ChatModelSelection {
  cliType: string;
  model: string;
  thinkingLevel: string | null;
}

/** One permission / sandbox mode offered by the permission select. */
export interface ChatPermissionOption {
  id: string;
  label: string;
  /** One-line explanation rendered under the label in the popover. */
  description?: string;
  /** `warn` renders the chip and option in the warning palette (e.g. bypass modes). */
  tone?: 'default' | 'warn';
}

/** One row in the context-ring breakdown (e.g. "System prompt", "Messages"). */
export interface ChatContextSection {
  label: string;
  tokens: number;
}

/**
 * Context-window usage snapshot rendered by the context ring. Hosts capture
 * this however their agent exposes it (e.g. a CLI `/context` probe) and pass
 * it in; `refreshRequested` asks the host for a fresh snapshot.
 */
export interface ChatContextUsage {
  usedTokens: number;
  maxTokens: number;
  sections?: readonly ChatContextSection[];
  /** ISO 8601 timestamp of when the snapshot was captured. */
  capturedAt?: string;
  /** Short provenance note shown in the popover footer (e.g. "via /context"). */
  sourceLabel?: string;
}

/**
 * Compact human label for a model id: `claude-sonnet-5` → "sonnet 5",
 * `claude-sonnet-4-6` → "sonnet 4.6", `vendor/some-model` → "some-model".
 * Unrecognised ids pass through unchanged.
 */
export function shortModelLabel(model: string | null | undefined): string {
  if (!model) return 'No model';
  const m = model.trim();
  if (!m) return 'No model';
  const claudeMatch = /^claude-([a-z]+)-(\d+)(?:-(\d+))?$/i.exec(m);
  if (claudeMatch) {
    const [, family, major, minor] = claudeMatch;
    return minor ? `${family.toLowerCase()} ${major}.${minor}` : `${family.toLowerCase()} ${major}`;
  }
  const slashIdx = m.indexOf('/');
  if (slashIdx >= 0 && slashIdx < m.length - 1) {
    return m.slice(slashIdx + 1);
  }
  return m;
}

/** "76400 / 200000" → "76.4k / 200k"-style token formatting for the ring. */
export function formatTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens < 0) return '0';
  if (tokens < 1000) return String(Math.round(tokens));
  const k = tokens / 1000;
  return k >= 100 ? `${Math.round(k)}k` : `${(Math.round(k * 10) / 10)}k`;
}
