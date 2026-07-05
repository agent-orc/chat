// Covers AnchoredPopoverDirective: fixed positioning above a trigger, and the
// left/right alignment choice. jsdom has no layout, so the trigger's rect is
// stubbed and offsetWidth is 0 (clamping is a no-op at that width).

import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AnchoredPopoverDirective } from './anchored-popover.directive';

@Component({
  standalone: true,
  imports: [AnchoredPopoverDirective],
  template: `
    <button #trigger class="trigger">T</button>
    <div #pop class="pop" [cacAnchoredPopover]="trigger" [popoverAlign]="align">popover</div>
  `,
})
class HostComponent {
  align: 'left' | 'right' = 'left';
}

function stubRect(el: HTMLElement, rect: Partial<DOMRect>): void {
  el.getBoundingClientRect = (): DOMRect =>
    ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...rect }) as DOMRect;
}

describe('AnchoredPopoverDirective', () => {
  it('positions the popover fixed and left-aligned above the trigger', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    const root = fixture.nativeElement as HTMLElement;
    stubRect(root.querySelector<HTMLElement>('.trigger')!, { left: 100, top: 500, right: 150, bottom: 520 });

    await fixture.whenStable(); // ngAfterViewInit → position()

    const pop = root.querySelector<HTMLElement>('.pop')!;
    expect(pop.style.position).toBe('fixed');
    expect(pop.style.left).toBe('100px');
    expect(pop.style.right).toBe('auto');
    expect(pop.style.bottom).toBe(`${window.innerHeight - 500 + 6}px`);
  });

  it('right-aligns to the trigger when popoverAlign is "right"', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.align = 'right';
    const root = fixture.nativeElement as HTMLElement;
    stubRect(root.querySelector<HTMLElement>('.trigger')!, { left: 900, top: 500, right: 980, bottom: 520 });

    await fixture.whenStable();

    const pop = root.querySelector<HTMLElement>('.pop')!;
    expect(pop.style.position).toBe('fixed');
    expect(pop.style.right).toBe(`${window.innerWidth - 980}px`);
    expect(pop.style.left).toBe('auto');
  });
});
