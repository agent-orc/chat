import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ArrowKeyScrollDirective } from './arrow-key-scroll.directive';

interface ScrollState {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}

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

function mockRect(
  el: HTMLElement,
  rect: { left: number; top: number; right: number; bottom: number }
): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  });
}

@Component({
  standalone: true,
  imports: [ArrowKeyScrollDirective],
  template: `
    <div class="surface" cacArrowKeyScroll>
      <div class="content">
        <button type="button">Action</button>
        <textarea rows="2"></textarea>
        <input />
        <select>
          <option>One</option>
        </select>
        <div class="editable" contenteditable="true">Editable</div>
        <div class="menu" role="menu" tabindex="0">Menu</div>
        <div class="listbox" role="listbox" tabindex="0">Listbox</div>
      </div>
    </div>
  `,
})
class SurfaceHostComponent {}

@Component({
  standalone: true,
  imports: [ArrowKeyScrollDirective],
  template: `
    <div class="surface surface--one" cacArrowKeyScroll>
      <button type="button">One</button>
    </div>
    <div class="surface surface--two" cacArrowKeyScroll>
      <button type="button">Two</button>
    </div>
  `,
})
class DualSurfaceHostComponent {}

describe('ArrowKeyScrollDirective', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const realGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(((el: Element, pseudo?: string | null) => {
      if (el instanceof HTMLElement && el.classList.contains('surface')) {
        return { overflowY: 'auto' } as CSSStyleDeclaration;
      }
      return realGetComputedStyle(el, pseudo);
    }) as typeof window.getComputedStyle);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function setupSurfaceHost(): {
    root: HTMLElement;
    state: ScrollState;
  } {
    const fixture = TestBed.createComponent(SurfaceHostComponent);
    const root = fixture.nativeElement as HTMLElement;
    const surface = root.querySelector<HTMLElement>('.surface')!;
    const state = mockScrollMetrics(surface, { scrollHeight: 1200, clientHeight: 300 });
    mockRect(surface, { left: 0, top: 0, right: 800, bottom: 600 });
    fixture.detectChanges();
    return { root, state };
  }

  function setupDualHost(): {
    root: HTMLElement;
    surfaceOne: HTMLElement;
    surfaceTwo: HTMLElement;
    stateOne: ScrollState;
    stateTwo: ScrollState;
  } {
    const fixture = TestBed.createComponent(DualSurfaceHostComponent);
    const root = fixture.nativeElement as HTMLElement;
    const surfaceOne = root.querySelector<HTMLElement>('.surface--one')!;
    const surfaceTwo = root.querySelector<HTMLElement>('.surface--two')!;
    const stateOne = mockScrollMetrics(surfaceOne, { scrollHeight: 1600, clientHeight: 400 });
    const stateTwo = mockScrollMetrics(surfaceTwo, { scrollHeight: 1600, clientHeight: 400 });
    mockRect(surfaceOne, { left: 0, top: 0, right: 700, bottom: 320 });
    mockRect(surfaceTwo, { left: 0, top: 360, right: 700, bottom: 700 });
    fixture.detectChanges();
    return { root, surfaceOne, surfaceTwo, stateOne, stateTwo };
  }

  it('scrolls up and down by a predictable step and prevents the default only when it moves', () => {
    const { root, state } = setupSurfaceHost();
    const surface = root.querySelector<HTMLElement>('.surface')!;

    state.scrollTop = 300;
    surface.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    document.dispatchEvent(down);

    expect(state.scrollTop).toBe(348);
    expect(down.defaultPrevented).toBe(true);

    const up = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    document.dispatchEvent(up);

    expect(state.scrollTop).toBe(300);
    expect(up.defaultPrevented).toBe(true);
  });

  it('supports normal keyboard repeat while the key is held', () => {
    const { root, state } = setupSurfaceHost();
    const surface = root.querySelector<HTMLElement>('.surface')!;

    state.scrollTop = 300;
    surface.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true, repeat: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true, repeat: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true, repeat: true }));

    expect(state.scrollTop).toBe(444);
  });

  it('prefers the active visible scroller over a different visible surface', () => {
    const { surfaceOne, stateOne, stateTwo } = setupDualHost();

    stateOne.scrollTop = 500;
    stateTwo.scrollTop = 900;
    surfaceOne.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    const key = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    document.dispatchEvent(key);

    expect(stateOne.scrollTop).toBe(452);
    expect(stateTwo.scrollTop).toBe(900);
    expect(key.defaultPrevented).toBe(true);
  });

  it('does not intercept arrow keys while focus is in input-like or menu-like controls', () => {
    const { root, state } = setupSurfaceHost();
    const surface = root.querySelector<HTMLElement>('.surface')!;
    const textarea = surface.querySelector('textarea')!;
    const input = surface.querySelector('input')!;
    const select = surface.querySelector('select')!;
    const editable = surface.querySelector<HTMLElement>('.editable')!;
    const menu = surface.querySelector<HTMLElement>('.menu')!;
    const listbox = surface.querySelector<HTMLElement>('.listbox')!;

    state.scrollTop = 300;
    surface.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    for (const target of [textarea, input, select, editable, menu, listbox]) {
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      expect(state.scrollTop).toBe(300);
      expect(event.defaultPrevented).toBe(false);
    }
  });
});
