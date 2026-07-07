/**
 * Specs for <cac-context-ring>: percent math, warn threshold, section
 * breakdown, and the refreshRequested host contract.
 */
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatContextUsage } from 'coding-agent-chat/core';
import { ContextRingComponent } from './context-ring.component';

const USAGE: ChatContextUsage = {
  usedTokens: 76_400,
  maxTokens: 200_000,
  sections: [
    { label: 'System prompt', tokens: 3_100 },
    { label: 'Messages', tokens: 55_100 },
  ],
  sourceLabel: 'via /context',
};

async function createRing(
  inputs: Record<string, unknown> = {}
): Promise<ComponentFixture<ContextRingComponent>> {
  const fixture = TestBed.createComponent(ContextRingComponent);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('ContextRingComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ContextRingComponent] });
  });

  it('shows a dash without a snapshot', async () => {
    const fixture = await createRing();
    expect(fixture.componentInstance.percent()).toBeNull();
    expect(fixture.componentInstance.percentLabel()).toBe('–');
  });

  it('computes percent, label, and token summary from the snapshot', async () => {
    const fixture = await createRing({ usage: USAGE });
    expect(fixture.componentInstance.percent()).toBeCloseTo(38.2, 1);
    expect(fixture.componentInstance.percentLabel()).toBe('38%');
    expect(fixture.componentInstance.usedLabel()).toBe('76.4k / 200k tokens');
    expect(fixture.componentInstance.warn()).toBe(false);
  });

  it('flips to warn tone at 80% usage', async () => {
    const fixture = await createRing({
      usage: { usedTokens: 170_000, maxTokens: 200_000 } satisfies ChatContextUsage,
    });
    expect(fixture.componentInstance.warn()).toBe(true);
  });

  it('maps sections to bar widths relative to the window', async () => {
    const fixture = await createRing({ usage: USAGE });
    const sections = fixture.componentInstance.sections();
    expect(sections.map((s) => s.label)).toEqual(['System prompt', 'Messages']);
    expect(sections[1].widthPct).toBeCloseTo(27.55, 1);
  });

  it('requests a snapshot when opened without one', async () => {
    const fixture = await createRing();
    const refreshed = vi.fn();
    fixture.componentInstance.refreshRequested.subscribe(refreshed);
    fixture.componentInstance.togglePopover(new MouseEvent('click'));
    expect(fixture.componentInstance.popoverOpen()).toBe(true);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('emits refreshRequested from the popover button unless busy', async () => {
    const fixture = await createRing({ usage: USAGE, busy: true });
    const refreshed = vi.fn();
    fixture.componentInstance.refreshRequested.subscribe(refreshed);
    fixture.componentInstance.onRefreshClick();
    expect(refreshed).not.toHaveBeenCalled();

    fixture.componentRef.setInput('busy', false);
    await fixture.whenStable();
    fixture.componentInstance.onRefreshClick();
    expect(refreshed).toHaveBeenCalledTimes(1);
  });
});
