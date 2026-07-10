// Covers the pure inline-reference kernel: match precedence across matchers,
// and the markdown-safe marker injection (skips code fences, inline code and
// links; leaves prose untouched when no matcher is registered). These run
// under raw vitest (jsdom) — the live component-slotting is exercised in
// markdown-view.component.spec.ts.
import { describe, expect, it } from 'vitest';

import {
  findInlineReferenceMatches,
  injectInlineReferenceMarkers,
  INLINE_REF_MARKER_ATTR,
  INLINE_REF_TOKEN_ATTR,
  type InlineReferencePattern,
} from './markdown-utils';

const TASK: InlineReferencePattern = { id: 'task', pattern: /\b[A-Z]{2,}-\d+\b/g };
const URL: InlineReferencePattern = { id: 'url', pattern: /https?:\/\/\S+/g };

describe('findInlineReferenceMatches', () => {
  it('finds a single task-key token with its position', () => {
    const matches = findInlineReferenceMatches('See AGT-1234 today.', [TASK]);
    expect(matches).toEqual([
      { matcherId: 'task', token: 'AGT-1234', groups: {}, start: 4, end: 12 },
    ]);
  });

  it('returns matches left-to-right and non-overlapping', () => {
    const matches = findInlineReferenceMatches('AGT-1 then CAR-2 then AGT-3', [TASK]);
    expect(matches.map((m) => m.token)).toEqual(['AGT-1', 'CAR-2', 'AGT-3']);
  });

  it('exposes named capture groups', () => {
    const withGroups: InlineReferencePattern = {
      id: 'task',
      pattern: /\b(?<board>[A-Z]{2,})-(?<num>\d+)\b/g,
    };
    const [match] = findInlineReferenceMatches('AGT-1234', [withGroups]);
    expect(match.groups).toEqual({ board: 'AGT', num: '1234' });
  });

  it('is a no-op with no matchers', () => {
    expect(findInlineReferenceMatches('AGT-1234', [])).toEqual([]);
  });

  describe('precedence', () => {
    it('prefers the earlier-registered matcher when two claim the same span', () => {
      const primary: InlineReferencePattern = { id: 'primary', pattern: /\bAGT-\d+\b/g };
      const secondary: InlineReferencePattern = { id: 'secondary', pattern: /\b[A-Z]+-\d+\b/g };
      const [match] = findInlineReferenceMatches('AGT-9', [primary, secondary]);
      expect(match.matcherId).toBe('primary');

      // Flip the order → the other matcher wins the same span.
      const [flipped] = findInlineReferenceMatches('AGT-9', [secondary, primary]);
      expect(flipped.matcherId).toBe('secondary');
    });

    it('lets distinct matchers each claim their own token', () => {
      const matches = findInlineReferenceMatches('AGT-1 see https://x.dev/p', [TASK, URL]);
      expect(matches.map((m) => [m.matcherId, m.token])).toEqual([
        ['task', 'AGT-1'],
        ['url', 'https://x.dev/p'],
      ]);
    });
  });
});

describe('injectInlineReferenceMarkers', () => {
  function markerTokens(html: string): string[] {
    const template = document.createElement('template');
    template.innerHTML = html;
    return Array.from(
      template.content.querySelectorAll(`[${INLINE_REF_MARKER_ATTR}]`),
    ).map((el) => el.getAttribute(INLINE_REF_TOKEN_ATTR) ?? '');
  }

  it('wraps a matched token in a placeholder marker carrying its matcher id + token', () => {
    const out = injectInlineReferenceMarkers('<p>See AGT-1234 now.</p>', [TASK]);
    const template = document.createElement('template');
    template.innerHTML = out;
    const marker = template.content.querySelector(`[${INLINE_REF_MARKER_ATTR}="task"]`);
    expect(marker).not.toBeNull();
    expect(marker!.getAttribute(INLINE_REF_TOKEN_ATTR)).toBe('AGT-1234');
    expect(marker!.textContent).toBe('AGT-1234');
    // Surrounding prose is preserved.
    expect(template.content.querySelector('p')!.textContent).toBe('See AGT-1234 now.');
  });

  it('leaves tokens inside a fenced code block plain', () => {
    const html = '<pre class="md-code"><code>deploy AGT-1234</code></pre>';
    const out = injectInlineReferenceMarkers(html, [TASK]);
    expect(out).toBe(html);
    expect(markerTokens(out)).toEqual([]);
  });

  it('leaves tokens inside inline code and links plain', () => {
    const html = '<p>ok <code>AGT-1</code> and <a href="#">AGT-2</a></p>';
    const out = injectInlineReferenceMarkers(html, [TASK]);
    expect(markerTokens(out)).toEqual([]);
  });

  it('rewrites prose tokens but skips the ones inside code in the same body', () => {
    const html = '<p>fix AGT-1</p><pre><code>AGT-2</code></pre>';
    const out = injectInlineReferenceMarkers(html, [TASK]);
    expect(markerTokens(out)).toEqual(['AGT-1']);
  });

  it('returns the html byte-for-byte unchanged when no matcher is registered', () => {
    const html = '<p>See AGT-1234 now.</p>';
    expect(injectInlineReferenceMarkers(html, [])).toBe(html);
  });

  it('serialises named groups onto the marker for later hydration', () => {
    const withGroups: InlineReferencePattern = {
      id: 'task',
      pattern: /\b(?<board>[A-Z]{2,})-(?<num>\d+)\b/g,
    };
    const out = injectInlineReferenceMarkers('<p>AGT-7</p>', [withGroups]);
    const template = document.createElement('template');
    template.innerHTML = out;
    const marker = template.content.querySelector(`[${INLINE_REF_MARKER_ATTR}="task"]`)!;
    expect(JSON.parse(marker.getAttribute('data-cac-ref-groups')!)).toEqual({
      board: 'AGT',
      num: '7',
    });
  });
});
