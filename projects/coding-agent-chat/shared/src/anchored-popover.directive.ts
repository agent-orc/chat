import {
  AfterViewInit,
  Directive,
  ElementRef,
  OnDestroy,
  inject,
  input,
} from '@angular/core';

/**
 * Anchors the host element as a fixed-position popover just above a trigger,
 * so it escapes any `overflow: hidden/auto` ancestor. The composer's footer
 * chips (model / permission / context) live inside the rounded, clipped
 * `.chat` container; an absolutely-positioned popover there gets cut off at
 * the container edge. Fixed positioning against the viewport avoids that.
 *
 * Re-anchors on scroll (capture phase, so a scroll on ANY ancestor scroller
 * counts) and on resize while mounted. The host owns show/hide — typically an
 * `@if` around the popover — so this directive's own create/destroy lifecycle
 * brackets the open state; nothing else to wire.
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
  private readonly reflow = (): void => this.schedule();

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;
    this.position();
    const opts = { passive: true, signal: this.aborter.signal } as const;
    // Capture phase so a scroll on any ancestor scroll container re-anchors us.
    window.addEventListener('scroll', this.reflow, { ...opts, capture: true });
    window.addEventListener('resize', this.reflow, opts);
  }

  ngOnDestroy(): void {
    this.aborter.abort();
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

    el.style.position = 'fixed';
    el.style.top = 'auto';
    // Open upward: the popover's bottom sits `gap` px above the trigger's top.
    el.style.bottom = `${Math.round(window.innerHeight - rect.top + this.gap())}px`;

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
