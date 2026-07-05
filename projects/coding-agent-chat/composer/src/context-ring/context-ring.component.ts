import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TooltipDirective } from '@coding-agent/chat/shared';
import { ChatContextUsage, formatTokenCount } from '@coding-agent/chat/core';

/** Radius of the ring circles in the 18x18 viewBox — shared with the template. */
const RING_RADIUS = 7;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Compact context-window indicator for the composer footer: a small ring
 * showing percent-used, with a popover breaking the usage down per section
 * and a Refresh affordance.
 *
 * Presentational only — the host supplies a {@link ChatContextUsage}
 * snapshot (however its agent exposes one, e.g. a CLI `/context` probe)
 * and answers `refreshRequested` by capturing a fresh snapshot.
 */
@Component({
  selector: 'cac-context-ring',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TooltipDirective],
  templateUrl: './context-ring.component.html',
  styleUrls: ['./context-ring.component.scss'],
})
export class ContextRingComponent {
  readonly usage = input<ChatContextUsage | null>(null);
  /** True while the host is capturing a fresh snapshot. */
  readonly busy = input<boolean>(false);
  readonly triggerTestid = input<string>('cac-context-ring-trigger');
  readonly popoverTestidPrefix = input<string>('cac-context-ring-popover');

  /** Asks the host to capture a fresh usage snapshot. */
  readonly refreshRequested = output<void>();

  readonly popoverOpen = signal<boolean>(false);

  private readonly triggerBtnRef = viewChild<ElementRef<HTMLButtonElement>>('triggerBtn');

  readonly circumference = RING_CIRCUMFERENCE;

  /** Percent of the window in use, clamped to [0, 100]; null without a snapshot. */
  readonly percent = computed<number | null>(() => {
    const u = this.usage();
    if (!u || !(u.maxTokens > 0)) return null;
    const pct = (u.usedTokens / u.maxTokens) * 100;
    return Math.min(100, Math.max(0, pct));
  });

  readonly percentLabel = computed<string>(() => {
    const pct = this.percent();
    return pct === null ? '–' : `${Math.round(pct)}%`;
  });

  /** Stroke length for the filled arc in the trigger + popover rings. */
  readonly dash = computed<number>(() => {
    const pct = this.percent() ?? 0;
    return (pct / 100) * RING_CIRCUMFERENCE;
  });

  /** High usage flips the ring to the warning palette. */
  readonly warn = computed<boolean>(() => (this.percent() ?? 0) >= 80);

  readonly usedLabel = computed<string>(() => {
    const u = this.usage();
    if (!u) return '';
    return `${formatTokenCount(u.usedTokens)} / ${formatTokenCount(u.maxTokens)} tokens`;
  });

  readonly tooltip = computed<string>(() => {
    const pct = this.percent();
    if (pct === null) return 'Context usage unknown — click to refresh';
    return `Context: ${Math.round(pct)}% used (${this.usedLabel()})`;
  });

  readonly sections = computed(() => {
    const u = this.usage();
    if (!u?.sections?.length || !(u.maxTokens > 0)) return [];
    return u.sections.map((s) => ({
      label: s.label,
      tokens: formatTokenCount(s.tokens),
      widthPct: Math.min(100, Math.max(0, (s.tokens / u.maxTokens) * 100)),
    }));
  });

  readonly footerLabel = computed<string>(() => {
    const u = this.usage();
    if (!u) return 'No snapshot yet';
    const parts: string[] = [];
    if (u.sourceLabel) parts.push(u.sourceLabel);
    if (u.capturedAt) {
      const t = Date.parse(u.capturedAt);
      if (Number.isFinite(t)) {
        parts.push(`captured ${new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      }
    }
    return parts.join(' · ');
  });

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.popoverOpen()) this.closePopover();
  }

  togglePopover(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.popoverOpen()) {
      this.closePopover();
      return;
    }
    this.popoverOpen.set(true);
    // Opening with no snapshot doubles as the first capture request.
    if (!this.usage() && !this.busy()) this.refreshRequested.emit();
  }

  closePopover(): void {
    this.popoverOpen.set(false);
    queueMicrotask(() => this.triggerBtnRef()?.nativeElement.focus());
  }

  onRefreshClick(): void {
    if (this.busy()) return;
    this.refreshRequested.emit();
  }

  onBackdropClick(): void {
    this.closePopover();
  }
}
