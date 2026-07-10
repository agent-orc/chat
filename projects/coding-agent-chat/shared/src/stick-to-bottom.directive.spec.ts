// Covers StickToBottomDirective: initial pin, re-pin on content growth while
// stuck, release when the user scrolls up past the threshold, re-stick near
// the bottom, the scrollToBottom() jump API, and no yanking while editing.

import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { StickToBottomDirective } from './stick-to-bottom.directive';

@Component({
  standalone: true,
  imports: [StickToBottomDirective],
  template: `
    <div class="scroller" cacStickToBottom>
      <div class="content">line</div>
      <textarea></textarea>
    </div>
  `,
})
class StickHostComponent {
  readonly stick = viewChild.required(StickToBottomDirective);
}

/** Host with NO scrollable ancestor — container resolution falls back to the
 *  document scroller (an inline conversation on a normal page). */
@Component({
  standalone: true,
  imports: [StickToBottomDirective],
  template: `
    <div class="inline-host" cacStickToBottom>
      <div class="content">line</div>
    </div>
  `,
})
class InlineHostComponent {
  readonly stick = viewChild.required(StickToBottomDirective);
}

interface ScrollState {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}

/** jsdom has no layout: back scroll metrics with a mutable state object. */
function mockScrollMetrics(
  el: HTMLElement,
  init: { scrollHeight: number; clientHeight: number }
): ScrollState {
  const state: ScrollState = { ...init, scrollTop: 0 };
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => state.scrollHeight,
  });
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    get: () => state.clientHeight,
  });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => state.scrollTop,
    set: (value: number) => {
      state.scrollTop = value;
    },
  });
  return state;
}

describe('StickToBottomDirective', () => {
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRafId: number;
  let resizeCallbacks: ResizeObserverCallback[];

  beforeEach(() => {
    // Deterministic rAF: queue callbacks and flush manually via flushFrames().
    rafCallbacks = new Map();
    nextRafId = 1;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
      const id = nextRafId++;
      rafCallbacks.set(id, cb);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
      rafCallbacks.delete(id);
    });

    // jsdom has no ResizeObserver: record callbacks and trigger them manually.
    resizeCallbacks = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          resizeCallbacks.push(cb);
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    );

    // jsdom's computed styles are unreliable for overflow-y: make the host
    // element report itself as the scroll container.
    const realGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(((
      el: Element,
      pseudo?: string | null
    ) => {
      if (el instanceof HTMLElement && el.classList.contains('scroller')) {
        return { overflowY: 'auto' } as CSSStyleDeclaration;
      }
      return realGetComputedStyle(el, pseudo);
    }) as typeof window.getComputedStyle);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function flushFrames(): void {
    while (rafCallbacks.size > 0) {
      const pending = [...rafCallbacks.values()];
      rafCallbacks.clear();
      pending.forEach((cb) => cb(0));
    }
  }

  function triggerResize(): void {
    resizeCallbacks.forEach((cb) => cb([], undefined as unknown as ResizeObserver));
  }

  async function setup(): Promise<{
    scroller: HTMLElement;
    state: ScrollState;
    stick: StickToBottomDirective;
  }> {
    const fixture = TestBed.createComponent(StickHostComponent);
    await fixture.whenStable();
    const scroller = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.scroller'
    )!;
    const state = mockScrollMetrics(scroller, { scrollHeight: 1000, clientHeight: 200 });
    return { scroller, state, stick: fixture.componentInstance.stick() };
  }

  it('never scrolls the PAGE on init when the fallback container is the document', async () => {
    // Regression: an inline conversation view on a docs/marketing page (no
    // scrollable ancestor) used to pin document.scrollingElement on init,
    // yanking the whole viewport to the component's bottom on load and on
    // every tab-switch re-creation. Spy on the prototype accessor — jsdom
    // does not allow redefining scrollTop on the documentElement instance.
    const setSpy = vi.spyOn(Element.prototype, 'scrollTop', 'set');

    const fixture = TestBed.createComponent(InlineHostComponent);
    await fixture.whenStable();
    flushFrames();

    expect(setSpy).not.toHaveBeenCalled(); // the page stays where the user was

    // The directive is fully inert on the document scroller: content
    // mutations (streamed rows) must not re-pin the page either.
    const host = (fixture.nativeElement as HTMLElement).querySelector('.inline-host')!;
    const row = document.createElement('div');
    row.textContent = 'streamed row';
    host.appendChild(row);
    await new Promise((resolve) => setTimeout(resolve, 0)); // deliver mutations
    flushFrames();
    expect(setSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.stick().stuck()).toBe(true);
  });

  it('re-pins on CONTENT mutations when the fixed-height scroller itself never resizes', async () => {
    // Regression: with a fixed-height scroll container (virtualised
    // conversation in a sized frame), streamed rows grow scrollHeight but the
    // element's border box never changes — the ResizeObserver stays silent
    // and auto-follow died once the viewport was full. The MutationObserver
    // path must cover this: append a row WITHOUT firing any resize callback.
    const { scroller, state } = await setup();
    flushFrames();
    expect(scroller.scrollTop).toBe(1000); // initial pin

    state.scrollHeight = 1600; // content grew…
    const row = document.createElement('div');
    row.textContent = 'streamed row';
    scroller.appendChild(row); // …via a DOM mutation only (no resize event)
    await new Promise((resolve) => setTimeout(resolve, 0)); // deliver mutations

    flushFrames();
    expect(scroller.scrollTop).toBe(1600); // followed to the new bottom
  });

  it('does not thrash scrollTop when a virtualised re-render bounces back while pinned (no 1px flicker)', async () => {
    // Regression (the reported "nervous 1px up/down flicker"): inside a
    // virtualised, fixed-height consumer, pinning to the bottom makes the
    // windowing math re-render the visible slice — a childList mutation the
    // MutationObserver catches — while rounded spacer heights jitter
    // scrollHeight by ±1px. An unconditional re-pin would write scrollTop
    // again against the shifted height, perturb the window again, and
    // ping-pong forever. Once we are already at the bottom the pin must be a
    // no-op, so the loop can never start.
    const { scroller, state, stick } = await setup();
    flushFrames(); // initial pin
    expect(scroller.scrollTop).toBe(1000);

    // Emulate a real browser's clamp: after pinning, scrollTop rests at
    // scrollHeight - clientHeight, i.e. distance-from-bottom 0.
    state.scrollTop = state.scrollHeight - state.clientHeight; // 800

    // Count every further scrollTop write; a stable pin makes none.
    let scrollTopWrites = 0;
    const backing = Object.getOwnPropertyDescriptor(scroller, 'scrollTop')!;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: backing.get,
      set(value: number) {
        scrollTopWrites++;
        (backing.set as (v: number) => void).call(this, value);
      },
    });

    // Five rounds of the virtualiser bouncing back with a 1px height jitter,
    // each delivered as a childList mutation (append + remove a windowed row).
    for (let i = 0; i < 5; i++) {
      state.scrollHeight = 1000 + (i % 2); // 1000 / 1001 / … — a ±1px jitter
      const windowedRow = document.createElement('li');
      scroller.appendChild(windowedRow); // childList mutation → MutationObserver
      await new Promise((resolve) => setTimeout(resolve, 0)); // deliver mutations
      flushFrames(); // run any scheduled pin rAF (must be a no-op)
      scroller.removeChild(windowedRow);
      await new Promise((resolve) => setTimeout(resolve, 0));
      flushFrames();
    }

    expect(scrollTopWrites).toBe(0); // idempotent pin: the flicker loop never started
    expect(stick.stuck()).toBe(true); // still following the bottom
  });

  it('pins to the bottom initially and re-pins when content grows while stuck', async () => {
    const { scroller, state, stick } = await setup();

    flushFrames();
    expect(scroller.scrollTop).toBe(1000);
    expect(stick.stuck()).toBe(true);

    state.scrollHeight = 1400;
    triggerResize();
    flushFrames();
    expect(scroller.scrollTop).toBe(1400);
    expect(stick.stuck()).toBe(true);
  });

  it('releases when the user scrolls up and stops yanking them back down', async () => {
    const { scroller, state, stick } = await setup();
    flushFrames();

    scroller.scrollTop = 300; // distance from bottom: 1000 - 300 - 200 = 500 > 24
    scroller.dispatchEvent(new Event('scroll'));
    expect(stick.stuck()).toBe(false);

    state.scrollHeight = 1500;
    triggerResize();
    flushFrames();
    expect(scroller.scrollTop).toBe(300);
  });

  it('holds the pin when growing content fires a scroll without an up-move (tool-burst expand)', async () => {
    const { scroller, state, stick } = await setup();
    flushFrames();
    expect(stick.stuck()).toBe(true); // pinned: scrollTop 1000, distance 0

    // Expanding a disclosure (tool burst / "show more") grows the content and
    // the browser fires a scroll event as it reflows — but scrollTop does not
    // move UP. This must NOT be read as the user scrolling away.
    state.scrollHeight = 1600; // grew by 600; distance-from-bottom now 400 > 24
    scroller.dispatchEvent(new Event('scroll'));
    expect(stick.stuck()).toBe(true); // pin held (the reported bug: it released)

    // Follow-up growth still re-pins to the new bottom, so auto-follow lives on.
    triggerResize();
    flushFrames();
    expect(scroller.scrollTop).toBe(1600);
    expect(stick.stuck()).toBe(true);
  });

  it('re-sticks when the user scrolls back to within the threshold', async () => {
    const { scroller, stick } = await setup();
    flushFrames();

    scroller.scrollTop = 300;
    scroller.dispatchEvent(new Event('scroll'));
    expect(stick.stuck()).toBe(false);

    scroller.scrollTop = 790; // distance from bottom: 1000 - 790 - 200 = 10 <= 24
    scroller.dispatchEvent(new Event('scroll'));
    expect(stick.stuck()).toBe(true);
  });

  it('scrollToBottom() re-pins after a release (jump-to-latest affordance)', async () => {
    const { scroller, state, stick } = await setup();
    flushFrames();

    scroller.scrollTop = 100;
    scroller.dispatchEvent(new Event('scroll'));
    expect(stick.stuck()).toBe(false);

    state.scrollHeight = 1600;
    stick.scrollToBottom();
    expect(stick.stuck()).toBe(true);
    flushFrames();
    expect(scroller.scrollTop).toBe(1600);
  });

  it('does not re-pin while an editable element inside the container has focus', async () => {
    const { scroller, state, stick } = await setup();
    flushFrames();
    expect(scroller.scrollTop).toBe(1000);

    const textarea = scroller.querySelector('textarea')!;
    textarea.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    state.scrollHeight = 1400;
    triggerResize();
    flushFrames();
    expect(scroller.scrollTop).toBe(1000);
    expect(stick.stuck()).toBe(true);
  });
});
