// Covers TooltipDirective + TooltipController: singleton tooltip shows on
// mouseenter/focusin, hides on mouseleave/focusout/click/touch-away, renders
// structured (title + sanitised HTML body) content and severity classes.

import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { TooltipDirective } from './tooltip.directive';
import { TooltipInput, TooltipSeverity } from './tooltip.types';

@Component({
  standalone: true,
  imports: [TooltipDirective],
  template: `
    <button type="button" [cacTooltip]="tip()" [tooltipSeverity]="severity()">
      anchor
    </button>
  `,
})
class TooltipHostComponent {
  readonly tip = signal<TooltipInput>('Plain tooltip text');
  readonly severity = signal<TooltipSeverity | undefined>(undefined);
}

function tooltipEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="cac-tooltip"]');
}

describe('TooltipDirective', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.cac-tooltip').forEach((el) => el.remove());
    document.getElementById('cac-tooltip-styles')?.remove();
  });

  async function setup(
    tip?: TooltipInput,
    severity?: TooltipSeverity
  ): Promise<{ anchor: HTMLButtonElement }> {
    const fixture = TestBed.createComponent(TooltipHostComponent);
    if (tip !== undefined) fixture.componentInstance.tip.set(tip);
    if (severity !== undefined) fixture.componentInstance.severity.set(severity);
    await fixture.whenStable();
    const anchor = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    return { anchor };
  }

  it('shows on mouseenter and hides again on mouseleave', async () => {
    const { anchor } = await setup();

    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    const tip = tooltipEl();
    expect(tip).not.toBeNull();
    expect(tip!.style.visibility).toBe('visible');
    expect(tip!.querySelector('.cac-tooltip__body')!.textContent).toContain(
      'Plain tooltip text'
    );

    anchor.dispatchEvent(new MouseEvent('mouseleave'));
    expect(tip!.style.visibility).toBe('hidden');
  });

  it('shows on focusin and hides on focusout', async () => {
    const { anchor } = await setup();

    anchor.dispatchEvent(new FocusEvent('focusin'));
    expect(tooltipEl()!.style.visibility).toBe('visible');

    anchor.dispatchEvent(new FocusEvent('focusout'));
    expect(tooltipEl()!.style.visibility).toBe('hidden');
  });

  it('hides on click of the anchor', async () => {
    const { anchor } = await setup();

    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    expect(tooltipEl()!.style.visibility).toBe('visible');

    anchor.dispatchEvent(new MouseEvent('click'));
    expect(tooltipEl()!.style.visibility).toBe('hidden');
  });

  it('renders structured content with a title and sanitises the HTML body', async () => {
    const { anchor } = await setup({
      title: 'Build failed',
      body: 'Exit code <code>1</code> <script>alert("x")</script>see log',
    });

    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    const tip = tooltipEl()!;

    const title = tip.querySelector<HTMLElement>('.cac-tooltip__title')!;
    expect(title.textContent).toBe('Build failed');
    expect(title.style.display).not.toBe('none');

    const body = tip.querySelector<HTMLElement>('.cac-tooltip__body')!;
    expect(body.innerHTML).toContain('<code>1</code>');
    expect(body.innerHTML).not.toContain('script');
    expect(body.textContent).toContain('see log');
  });

  it('applies the severity modifier class', async () => {
    const { anchor } = await setup(undefined, 'warn');

    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    expect(tooltipEl()!.classList.contains('cac-tooltip--warn')).toBe(true);
  });

  it('does not create any tooltip DOM for empty content', async () => {
    const { anchor } = await setup('   ');

    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    expect(tooltipEl()).toBeNull();
  });

  it('shows on touchstart and auto-hides after the 3s touch timer', async () => {
    const { anchor } = await setup();
    vi.useFakeTimers();

    anchor.dispatchEvent(new Event('touchstart'));
    expect(tooltipEl()!.style.visibility).toBe('visible');

    vi.advanceTimersByTime(3000);
    expect(tooltipEl()!.style.visibility).toBe('hidden');
  });

  it('a touch outside the anchor dismisses an open touch tooltip immediately', async () => {
    const { anchor } = await setup();
    vi.useFakeTimers();

    anchor.dispatchEvent(new Event('touchstart'));
    expect(tooltipEl()!.style.visibility).toBe('visible');

    document.body.dispatchEvent(new Event('touchstart', { bubbles: true }));
    expect(tooltipEl()!.style.visibility).toBe('hidden');
  });
});
