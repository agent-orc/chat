/**
 * Resolve the nearest scrollable ancestor for a host element.
 *
 * Returns the host itself when it scrolls, otherwise the first ancestor whose
 * computed `overflow-y` allows scrolling. Falls back to the document scrolling
 * element so detached/edge layouts still work.
 */
export function resolveScrollContainer(host: HTMLElement): HTMLElement | null {
  if (typeof window === 'undefined') return null;
  let el: HTMLElement | null = host;
  while (el) {
    const oy = getComputedStyle(el).overflowY;
    if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return el;
    el = el.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

