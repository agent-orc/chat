// Covers PlanChecklistComponent: the progress badge, per-status glyphs and
// data-status attributes, and the all-done treatment.

import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import type { PlanItem } from '@coding-agent/chat/core';
import { PlanChecklistComponent } from './plan-checklist.component';

const item = (id: string, title: string, status: PlanItem['status']): PlanItem => ({ id, title, status });

async function render(items: PlanItem[]): Promise<ComponentFixture<PlanChecklistComponent>> {
  const fixture = TestBed.createComponent(PlanChecklistComponent);
  fixture.componentRef.setInput('items', items);
  await fixture.whenStable();
  return fixture;
}

describe('PlanChecklistComponent', () => {
  it('shows the completed/total progress and a row per item with its status', async () => {
    const fixture = await render([
      item('a', 'Analyse repo', 'completed'),
      item('b', 'Write README', 'in_progress'),
      item('c', 'Add tests', 'pending'),
    ]);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-testid="plan-progress"]')?.textContent?.trim()).toBe('1/3');
    const rows = el.querySelectorAll('[data-testid="plan-item"]');
    expect(rows).toHaveLength(3);
    expect(rows[0].getAttribute('data-status')).toBe('completed');
    expect(rows[1].getAttribute('data-status')).toBe('in_progress');
    expect(rows[2].getAttribute('data-status')).toBe('pending');
    expect(rows[0].textContent).toContain('Analyse repo');
    // In-progress uses the spinner glyph, completed the checked box.
    expect(rows[0].querySelector('.plan__check')?.textContent?.trim()).toBe('☑');
    expect(rows[1].querySelector('.plan__check')?.textContent?.trim()).toBe('⟳');
  });

  it('flags an all-completed plan as done', async () => {
    const fixture = await render([
      item('a', 'One', 'completed'),
      item('b', 'Two', 'cancelled'),
    ]);
    expect(fixture.nativeElement.querySelector('.plan')?.classList.contains('plan--done')).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="plan-progress"]')?.textContent?.trim()).toBe('1/2');
  });
});
