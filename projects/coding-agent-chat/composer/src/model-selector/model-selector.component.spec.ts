/**
 * Specs for <cac-model-selector>: open/commit flow, auto-commit on model
 * click when the CLI is unchanged, atomic Done after a CLI change, and the
 * catalogRequested/refreshRequested host contract.
 */
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatCliOption, ChatModelOption, ChatModelSelection } from '@coding-agent/chat/core';
import { ModelSelectorComponent } from './model-selector.component';

const CLIS: ChatCliOption[] = [
  { id: 'claude', label: 'Claude Code', icon: '✳' },
  { id: 'codex', label: 'Codex', icon: '◆' },
];

const MODELS: ChatModelOption[] = [
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    thinkingLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultThinkingLevel: 'high',
  },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', isDefault: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh', 'max'], defaultThinkingLevel: 'high' },
  { id: 'claude-retired', label: 'Retired', available: false },
];

async function createSelector(
  inputs: Record<string, unknown> = {}
): Promise<ComponentFixture<ModelSelectorComponent>> {
  const fixture = TestBed.createComponent(ModelSelectorComponent);
  fixture.componentRef.setInput('cliOptions', CLIS);
  fixture.componentRef.setInput('cliType', 'claude');
  fixture.componentRef.setInput('model', 'claude-opus-4-8');
  fixture.componentRef.setInput('models', MODELS);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return fixture;
}

function open(fixture: ComponentFixture<ModelSelectorComponent>): void {
  fixture.componentInstance.openPicker(new MouseEvent('click'));
  fixture.detectChanges();
}

describe('ModelSelectorComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ModelSelectorComponent] });
  });

  it('renders the short model label on the trigger chip', async () => {
    const fixture = await createSelector({ model: 'claude-sonnet-5' });
    const chip = fixture.nativeElement.querySelector('[data-testid="cac-model-selector-trigger"]');
    expect(chip.textContent).toContain('sonnet 5');
  });

  it('asks the host for the catalog when the picker opens', async () => {
    const fixture = await createSelector();
    const requested = vi.fn();
    fixture.componentInstance.catalogRequested.subscribe(requested);
    open(fixture);
    expect(requested).toHaveBeenCalledWith('claude');
  });

  it('hides unavailable models from the pill list', async () => {
    const fixture = await createSelector();
    open(fixture);
    expect(fixture.componentInstance.draftAvailableModels().map((m) => m.id)).toEqual([
      'claude-sonnet-5',
      'claude-opus-4-8',
    ]);
  });

  it('auto-commits when a model is clicked without a CLI change', async () => {
    const fixture = await createSelector();
    const committed = vi.fn();
    fixture.componentInstance.commit.subscribe(committed);
    open(fixture);
    fixture.componentInstance.onModelPillClick('claude-sonnet-5');
    expect(committed).toHaveBeenCalledWith({
      cliType: 'claude',
      model: 'claude-sonnet-5',
      thinkingLevel: 'high',
    } satisfies ChatModelSelection);
    expect(fixture.componentInstance.pickerOpen()).toBe(false);
  });

  it('keeps the picker open after a CLI change until Done', async () => {
    const fixture = await createSelector();
    const committed = vi.fn();
    fixture.componentInstance.commit.subscribe(committed);
    open(fixture);

    fixture.componentInstance.onCliPillClick('codex');
    expect(fixture.componentInstance.pickerOpen()).toBe(true);
    expect(committed).not.toHaveBeenCalled();

    // Host answers the catalogRequested('codex') by swapping the models input.
    fixture.componentRef.setInput('models', [
      { id: 'gpt-5-codex', label: 'GPT-5 Codex', isDefault: true },
    ] satisfies ChatModelOption[]);
    await fixture.whenStable();

    fixture.componentInstance.onDoneClick();
    expect(committed).toHaveBeenCalledWith({
      cliType: 'codex',
      model: 'gpt-5-codex',
      thinkingLevel: null,
    } satisfies ChatModelSelection);
  });

  it('offers the selected model thinking levels and commits level clicks', async () => {
    const fixture = await createSelector({ model: 'claude-sonnet-5', thinkingLevel: 'high' });
    const committed = vi.fn();
    fixture.componentInstance.commit.subscribe(committed);
    open(fixture);
    expect(fixture.componentInstance.draftThinkingLevels()).toEqual([
      'low', 'medium', 'high', 'xhigh', 'max',
    ]);
    fixture.componentInstance.onThinkingLevelPillClick('xhigh');
    expect(committed).toHaveBeenCalledWith({
      cliType: 'claude',
      model: 'claude-sonnet-5',
      thinkingLevel: 'xhigh',
    } satisfies ChatModelSelection);
  });

  it('emits refreshRequested for the draft CLI', async () => {
    const fixture = await createSelector();
    const refreshed = vi.fn();
    fixture.componentInstance.refreshRequested.subscribe(refreshed);
    open(fixture);
    fixture.componentInstance.onRefreshClick();
    expect(refreshed).toHaveBeenCalledWith('claude');
  });

  it('does not open when disabled', async () => {
    const fixture = await createSelector({ disabled: true });
    open(fixture);
    expect(fixture.componentInstance.pickerOpen()).toBe(false);
  });

  it('preserves an explicit "CLI default" (empty) selection when the catalog arrives late', async () => {
    // Committed model is CLI default (empty) — opening must not flip the draft
    // to the concrete catalog default when the host answers catalogRequested.
    const fixture = await createSelector({ cliType: 'claude', model: '', models: [] });
    open(fixture);
    expect(fixture.componentInstance.draftModel()).toBe('');

    // Host answers with a catalog whose default is a concrete model.
    fixture.componentRef.setInput('models', MODELS);
    await fixture.whenStable();

    // The empty selection is pinned on open, so it survives the late answer.
    expect(fixture.componentInstance.draftModel()).toBe('');
    expect(fixture.componentInstance.hasChanges()).toBe(false);
  });

  it('auto-selects the catalog default after a CLI switch (unpinned draft)', async () => {
    const fixture = await createSelector();
    open(fixture);
    fixture.componentInstance.onCliPillClick('codex');
    // Host answers for codex with a default model.
    fixture.componentRef.setInput('models', [
      { id: 'gpt-5-codex', label: 'GPT-5 Codex', isDefault: true },
    ] satisfies ChatModelOption[]);
    await fixture.whenStable();
    // A CLI switch resets the draft, so the new CLI's default fills in.
    expect(fixture.componentInstance.draftModel()).toBe('gpt-5-codex');
  });
});
