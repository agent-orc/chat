import {
  AfterViewInit,
  Directive,
  ElementRef,
  OnDestroy,
  inject,
  input,
} from '@angular/core';

/**
 * Anchors the host element as a fixed-position popover next to a trigger, so
 * it escapes any `overflow: hidden/auto` ancestor. The composer's footer
 * chips (model / permission / context) live inside the rounded, clipped
 * `.chat` container; an absolutely-positioned popover there gets cut off at
 * the container edge. Fixed positioning against the viewport avoids that.
 *
 * The established direction is upward. When that side cannot fit the panel,
 * it flips below; when neither side fits, it uses the larger side and makes
 * the panel scroll within the viewport. It re-anchors on scroll, viewport
 * resize, and panel-size changes while mounted. The host owns show/hide,
 * typically with an `@if` around the popover, so this directive's lifecycle
 * brackets the open state.
 *
 * Every browser API is guarded so the directive stays inert under SSR/jsdom.
 */
@Directive({
  selector: '[cacAnchoredPopover]',
  standalone: true,
})
export class AnchoredPopoverDirective implements AfterViewInit, OnDestroy {
  /** Trigger element the popover anchors above. */
  readonly anchor = input<HTMLElement | null | undefined>(null, { alias: 'cacAnchoredPopover' });
  /** Which horizontal edge aligns with the trigger. */
  readonly align = input<'left' | 'right'>('left', { alias: 'popoverAlign' });
  /** Gap (px) between the popover's bottom and the trigger's top. */
  readonly gap = input<number>(6, { alias: 'popoverGap' });

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly aborter = new AbortController();
  private frame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private initialMaxHeight = '';
  private initialOverflowY = '';
  private readonly reflow = (): void => this.schedule();

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;
    const el = this.host.nativeElement;
    this.initialMaxHeight = el.style.maxHeight;
    this.initialOverflowY = el.style.overflowY;
    this.position();
    const opts = { passive: true, signal: this.aborter.signal } as const;
    // Capture phase so a scroll on any ancestor scroll container re-anchors us.
    window.addEventListener('scroll', this.reflow, { ...opts, capture: true });
    window.addEventListener('resize', this.reflow, opts);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.reflow);
      this.resizeObserver.observe(el);
      const anchor = this.anchor();
      if (anchor) this.resizeObserver.observe(anchor);
    }
  }

  ngOnDestroy(): void {
    this.aborter.abort();
    this.resizeObserver?.disconnect();
    if (this.frame !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.frame);
    }
  }

  private schedule(): void {
    if (this.frame !== null || typeof requestAnimationFrame === 'undefined') return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.position();
    });
  }

  private position(): void {
    const anchor = this.anchor();
    if (!anchor || typeof window === 'undefined') return;
    const el = this.host.nativeElement;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const gap = this.gap();

    el.style.position = 'fixed';
    // Remove a constraint from an earlier, tighter layout before measuring the
    // natural panel height again. This also lets a resized viewport expand it.
    el.style.maxHeight = this.initialMaxHeight;
    el.style.overflowY = this.initialOverflowY;
    const height = Math.max(el.scrollHeight || 0, el.offsetHeight || 0);
    const spaceAbove = Math.max(0, rect.top - gap - margin);
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap - margin);
    const fitsAbove = height <= spaceAbove;
    const fitsBelow = height <= spaceBelow;
    const openAbove = fitsAbove || (!fitsBelow && spaceAbove >= spaceBelow);
    const availableHeight = openAbove ? spaceAbove : spaceBelow;

    if (height > availableHeight) {
      el.style.maxHeight = `${Math.max(0, Math.floor(availableHeight))}px`;
      el.style.overflowY = 'auto';
    }

    if (openAbove) {
      el.style.top = 'auto';
      el.style.bottom = `${Math.round(window.innerHeight - rect.top + gap)}px`;
    } else {
      el.style.bottom = 'auto';
      el.style.top = `${Math.round(rect.bottom + gap)}px`;
    }

    // Align one edge to the trigger, clamped so a wide popover near the
    // viewport edge stays fully on-screen.
    const width = el.offsetWidth || 0;
    const maxOffset = Math.max(margin, window.innerWidth - width - margin);
    if (this.align() === 'right') {
      el.style.left = 'auto';
      const fromRight = Math.min(Math.max(margin, window.innerWidth - rect.right), maxOffset);
      el.style.right = `${Math.round(fromRight)}px`;
    } else {
      el.style.right = 'auto';
      const fromLeft = Math.min(Math.max(margin, rect.left), maxOffset);
      el.style.left = `${Math.round(fromLeft)}px`;
    }
  }
}
