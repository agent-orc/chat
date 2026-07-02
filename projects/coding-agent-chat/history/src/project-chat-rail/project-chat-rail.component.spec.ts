/**
 * Specs for the minimap rail: chip derivation per turn kind (long /
 * event / error / running / none), clustering of overlapping chips,
 * and the chipSelect handoff on single-chip and cluster-member clicks.
 */
import { TestBed } from '@angular/core/testing';

import type { ProjectChatTurn } from '../project-chat.model';
import { ProjectChatRailComponent } from './project-chat-rail.component';

function turn(overrides: Partial<ProjectChatTurn> & { turnId: string }): ProjectChatTurn {
  return {
    author: 'agent',
    kind: 'turn',
    ts: '2026-01-01T00:00:00.000Z',
    body: 'short',
    ...overrides,
  };
}

const LONG_BODY = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n');

async function render(turns: ProjectChatTurn[], inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(ProjectChatRailComponent);
  fixture.componentRef.setInput('turns', turns);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('ProjectChatRailComponent (chip derivation)', () => {
  it('maps long turns, events and watchdog errors to chips and skips trivial turns', async () => {
    const fixture = await render([
      turn({ turnId: 't-short' }),
      turn({ turnId: 't-long', body: LONG_BODY }),
      turn({ turnId: 't-event', kind: 'event-update' }),
      turn({ turnId: 't-error', kind: 'event-watchdog' }),
    ]);

    const chips = fixture.componentInstance.chips();
    expect(chips.map((c) => c.turnId)).toEqual(['t-long', 't-event', 't-error']);
    expect(chips.map((c) => c.kind)).toEqual(['long', 'event', 'error']);
    // Long chips carry the hard-line count for the "▼ N" badge.
    expect(chips[0].longMoreLines).toBe(12);
  });

  it('marks the running turn even when it would otherwise be trivial', async () => {
    const fixture = await render(
      [turn({ turnId: 't-run' })],
      { runningTurnId: 't-run' },
    );
    expect(fixture.componentInstance.chips()[0]?.kind).toBe('running');
  });
});

describe('ProjectChatRailComponent (clustering + selection)', () => {
  it('clusters overlapping chips and picks the severest glyph', async () => {
    // With an unmeasured (0 px → clamped to 1 px) rail every chip lands
    // at ~0 px, so the two chips must collapse into one cluster.
    const fixture = await render([
      turn({ turnId: 't-long', body: LONG_BODY }),
      turn({ turnId: 't-error', kind: 'event-watchdog' }),
    ]);

    const el: HTMLElement = fixture.nativeElement;
    const cluster = el.querySelector<HTMLButtonElement>('[data-testid="pchat-rail-cluster"]');
    expect(cluster).toBeTruthy();
    expect(cluster?.getAttribute('data-count')).toBe('2');
    expect(cluster?.getAttribute('data-kind')).toBe('error');

    // First click opens the stacked menu instead of selecting.
    cluster!.click();
    await fixture.whenStable();
    const items = el.querySelectorAll<HTMLButtonElement>('[data-testid="pchat-rail-cluster-item"]');
    expect(items.length).toBe(2);

    const selections: string[] = [];
    fixture.componentInstance.chipSelect.subscribe((e) => selections.push(e.turnId));
    items[1].click();
    await fixture.whenStable();
    expect(selections).toEqual(['t-error']);
    // Selecting a member closes the menu.
    expect(el.querySelector('[data-testid="pchat-rail-cluster-menu"]')).toBeNull();
  });

  it('emits chipSelect directly for a single-member chip', async () => {
    const fixture = await render([turn({ turnId: 't-long', body: LONG_BODY })]);

    const selections: string[] = [];
    fixture.componentInstance.chipSelect.subscribe((e) => selections.push(e.turnId));

    const chip = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="pchat-rail-chip"]',
    );
    expect(chip).toBeTruthy();
    chip!.click();
    await fixture.whenStable();
    expect(selections).toEqual(['t-long']);
  });
});
