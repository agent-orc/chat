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
