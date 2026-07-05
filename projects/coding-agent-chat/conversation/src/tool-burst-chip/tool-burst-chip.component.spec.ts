// Covers the ToolBurstChip collapsed row: per-family leading glyph + failure override,
// the count badge and duration, the compact density attribute, and the open/expand
// behaviour (toggle, initialOpen, collapsedByDefault).

import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import type { RawLineRange, ToolBurstEvent } from '@coding-agent/chat/core';

import { ToolBurstChipComponent } from './tool-burst-chip.component';

const RANGE: RawLineRange = { source: 'cli-output.log', start: 10, end: 42 };

function burstEvent(overrides: Partial<Omit<ToolBurstEvent, 'kind'>> = {}): ToolBurstEvent {
  return {
    id: 'burst-1',
    kind: 'toolBurst',
    timestamp: '2026-05-05T12:00:01.000Z',
    count: 4,
    families: { read: 3, edit: 1 },
    failures: 0,
    durationMs: 0,
    rawRange: RANGE,
    ...overrides,
  };
}

async function render(
  event: ToolBurstEvent,
  inputs: Record<string, unknown> = {},
): Promise<ComponentFixture<ToolBurstChipComponent>> {
  const fixture = TestBed.createComponent(ToolBurstChipComponent);
  fixture.componentRef.setInput('event', event);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('ToolBurstChipComponent', () => {
  it('renders the dominant-family glyph and the count badge', async () => {
    const fixture = await render(burstEvent({ count: 4, families: { read: 3, edit: 1 } }));
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-testid="tool-burst-icon"]')?.textContent?.trim()).toBe('R');
    expect(el.querySelector('[data-testid="tool-burst-count"]')?.textContent?.trim()).toBe('4');
  });

  it('maps the command family to the shell glyph, and formats the duration chip', async () => {
    const fixture = await render(
      burstEvent({ count: 2, families: { command: 2 }, durationMs: 65_000 }),
    );
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-testid="tool-burst-icon"]')?.textContent?.trim()).toBe('$');
    expect(
      el.querySelector('[data-testid="tool-burst-duration"]')?.textContent?.trim(),
    ).toBe('1m 5s');
  });

  it('overrides the glyph with the failure marker and shows the failed count', async () => {
    const fixture = await render(
      burstEvent({ count: 5, families: { command: 5 }, failures: 2 }),
    );
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-testid="tool-burst-icon"]')?.textContent?.trim()).toBe('!');
    expect(
      el.querySelector('[data-testid="tool-burst-failures"]')?.textContent,
    ).toContain('2 failed');
    expect(
      el
        .querySelector('[data-testid="tool-burst-chip"]')
        ?.getAttribute('data-failed'),
    ).toBe('true');
  });

  it('reflects the compact density input on the chip root', async () => {
    const fixture = await render(burstEvent(), { density: 'compact' });
    const el: HTMLElement = fixture.nativeElement;

    expect(
      el.querySelector('[data-testid="tool-burst-chip"]')?.getAttribute('data-density'),
    ).toBe('compact');
  });

  it('starts collapsed by default and expands into the details section on click', async () => {
    const fixture = await render(burstEvent());
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-testid="tool-burst-details"]')).toBeNull();

    el.querySelector<HTMLButtonElement>('[data-testid="tool-burst-row"]')?.click();
    await fixture.whenStable();

    const details = el.querySelector('[data-testid="tool-burst-details"]');
    expect(details).toBeTruthy();
    // The expanded head names the raw range so Trace stays one click away.
    expect(
      details?.querySelector('[data-testid="tool-burst-range"]')?.textContent,
    ).toContain('cli-output.log:10-42');
  });

  it('opens automatically for initialOpen or events flagged collapsedByDefault=false', async () => {
    const viaInput = await render(burstEvent(), { initialOpen: true });
    expect(
      (viaInput.nativeElement as HTMLElement).querySelector(
        '[data-testid="tool-burst-details"]',
      ),
    ).toBeTruthy();

    const viaEvent = await render(burstEvent({ collapsedByDefault: false }));
    expect(
      (viaEvent.nativeElement as HTMLElement).querySelector(
        '[data-testid="tool-burst-details"]',
      ),
    ).toBeTruthy();
  });
});
