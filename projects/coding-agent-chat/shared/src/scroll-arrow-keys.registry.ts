import { Injectable } from '@angular/core';

interface RegisteredSurface {
  id: number;
  element: HTMLElement;
}

const ARROW_KEY_STEP_PX = 48;

const KEY_OWNERS = [
  'textarea',
  'input',
  'select',
  'option',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="tree"]',
  '[role="treegrid"]',
  '[role="grid"]',
  '[role="slider"]',
  '[role="spinbutton"]',
].join(',');

@Injectable({ providedIn: 'root' })
export class ScrollArrowKeysRegistry {
  private nextId = 1;
  private activeSurfaceId: number | null = null;
  private readonly surfaces = new Map<number, RegisteredSurface>();

  register(element: HTMLElement): number {
    const id = this.nextId++;
    this.surfaces.set(id, { id, element });
    return id;
  }

  updateSurface(id: number, element: HTMLElement): void {
    const surface = this.surfaces.get(id);
    if (surface) {
      surface.element = element;
    }
  }

  unregister(id: number): void {
    this.surfaces.delete(id);
    if (this.activeSurfaceId === id) {
      this.activeSurfaceId = null;
    }
  }

  markActive(id: number): void {
    if (this.surfaces.has(id)) {
      this.activeSurfaceId = id;
    }
  }

  handleKeydown(event: KeyboardEvent, surfaceId: number): boolean {
    if (event.defaultPrevented) return false;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;
    if (this.isOwnedByFocusableControl(event.target)) return false;

    const targetId = this.resolveTargetId(event);
    if (targetId !== surfaceId) return false;

    const surface = this.surfaces.get(surfaceId);
    const container = surface?.element;
    if (!container) return false;

    const delta = event.key === 'ArrowUp' ? -ARROW_KEY_STEP_PX : ARROW_KEY_STEP_PX;
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const nextScrollTop = Math.max(0, Math.min(maxScrollTop, container.scrollTop + delta));
    if (nextScrollTop === container.scrollTop) return false;

    container.scrollTop = nextScrollTop;
    event.preventDefault();
    return true;
  }

  private resolveTargetId(event: KeyboardEvent): number | null {
    const target = event.target;
    if (target instanceof Node) {
      for (const [id, surface] of this.surfaces) {
        if (surface.element.contains(target)) {
          return id;
        }
      }
    }

    if (this.activeSurfaceId !== null && this.surfaces.has(this.activeSurfaceId)) {
      return this.activeSurfaceId;
    }

    return this.bestVisibleSurfaceId();
  }

  private bestVisibleSurfaceId(): number | null {
    let best: { id: number; area: number } | null = null;
    for (const [id, surface] of this.surfaces) {
      const rect = surface.element.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      const area = width * height;
      if (area <= 0) continue;
      if (!best || area > best.area) {
        best = { id, area };
      }
    }
    return best?.id ?? null;
  }

  private isOwnedByFocusableControl(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return !!target.closest(KEY_OWNERS);
  }
}
