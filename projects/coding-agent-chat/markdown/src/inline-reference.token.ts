import { InjectionToken, type Type } from '@angular/core';
import type { InlineReferenceMatch, InlineReferencePattern } from './markdown-utils';

/**
 * A host-registered inline-reference renderer — the generic extension point
 * behind the conversation view. The library scans rendered message text (never
 * inside code fences, inline code or links) for `pattern` and slots `component`
 * in place of each match, feeding it the matched token.
 *
 * The library owns *matching* and *slotting* and stays host-agnostic: it never
 * learns what a reference means. Hosts decide what a reference *is* (task key,
 * ticket id, URL, @mention) and what its slot *renders* (a live micro-card, a
 * chip, a link).
 */
export interface InlineReferenceMatcher extends InlineReferencePattern {
  /** The host component slotted in place of each match. Must be standalone. */
  readonly component: Type<unknown>;
  /**
   * Maps a match to the slotted component's inputs (set via `setInput`).
   * Defaults to `{ token, match }`, so a component exposing a `token` and/or
   * `match` input works with zero wiring. Inputs the component does not
   * declare are ignored, so a slot may accept a subset.
   */
  readonly inputs?: (match: InlineReferenceMatch) => Record<string, unknown>;
}

/**
 * Host seam: the ordered set of inline-reference renderers applied to message
 * text. Defaults to `[]` — no matchers — so message text renders exactly as
 * before at zero cost, and other hosts see no behaviour change.
 *
 * Registration order is precedence order: when two matchers would claim the
 * same span, the one listed earlier wins.
 *
 * ```ts
 * providers: [
 *   {
 *     provide: INLINE_REFERENCE_RENDERERS,
 *     useValue: [
 *       { id: 'task', pattern: /\b[A-Z]{2,}-\d+\b/g, component: TaskMicroCardComponent },
 *       { id: 'url',  pattern: /https?:\/\/\S+/g,    component: UrlChipComponent },
 *     ] satisfies InlineReferenceMatcher[],
 *   },
 * ]
 * ```
 */
export const INLINE_REFERENCE_RENDERERS = new InjectionToken<readonly InlineReferenceMatcher[]>(
  'INLINE_REFERENCE_RENDERERS',
  {
    providedIn: 'root',
    factory: (): readonly InlineReferenceMatcher[] => [],
  },
);
