/**
 * Specs for <cac-model-selector>: open/commit flow, auto-commit on model
 * click when the CLI is unchanged, atomic Done after a CLI change, and the
 * catalogRequested/refreshRequested host contract.
 */
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatCliOption, ChatModelOption, ChatModelSelection } from 'coding-agent-chat/core';
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

  it('closes without committing when it becomes disabled while open', async () => {
    const fixture = await createSelector();
    const committed = vi.fn();
    fixture.componentInstance.commit.subscribe(committed);
    open(fixture);

    fixture.componentRef.setInput('disabled', true);
    fixture.componentInstance.onModelPillClick('claude-sonnet-5');
    await fixture.whenStable();

    expect(committed).not.toHaveBeenCalled();
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

  // ── New-model contract: a host that surfaces GPT-5.6 with an extra-high
  //    reasoning level must light up the model pill and every level pill
  //    (incl. xhigh) purely from the catalog — nothing about "gpt-5.6" or
  //    "xhigh" is hardcoded in the selector. The mirror case (a catalog that
  //    omits 5.6) must not leave a ghost entry behind.
  describe('GPT-5.6 host catalog (catalog-driven, no hardcoding)', () => {
    // Levels run low..xhigh with xhigh as the default — exactly the shape the
    // Codex CLI reports for gpt-5.6. `label` is intentionally distinct from
    // `id` so pill text is asserted against the host label, not the id.
    const GPT56: ChatModelOption = {
      id: 'gpt-5.6',
      label: 'GPT-5.6',
      isDefault: true,
      thinkingLevels: ['low', 'medium', 'high', 'xhigh'],
      defaultThinkingLevel: 'xhigh',
    };
    const CODEX_WITH_56: ChatModelOption[] = [
      GPT56,
      { id: 'gpt-5-codex', label: 'GPT-5 Codex' },
    ];
    const CODEX_WITHOUT_56: ChatModelOption[] = [
      { id: 'gpt-5-codex', label: 'GPT-5 Codex', isDefault: true },
    ];

    const modelPillId = 'cac-model-selector-picker-model-gpt-5.6';
    const levelPillIds = ['low', 'medium', 'high', 'xhigh'].map(
      (l) => `cac-model-selector-picker-thinking-${l}`,
    );

    // Only the pill buttons — not the radiogroup container div, which shares
    // the `-thinking-`/`-model-` prefix via its `-pills` testid.
    function pillTestids(fixture: ComponentFixture<ModelSelectorComponent>, prefix: string): string[] {
      const nodes = fixture.nativeElement.querySelectorAll(
        `button[data-testid^="${prefix}"]`,
      ) as NodeListOf<HTMLElement>;
      return Array.from(nodes).map((el) => el.getAttribute('data-testid')!);
    }

    it('renders the gpt-5.6 model pill and every level pill incl. xhigh from the catalog', async () => {
      const fixture = await createSelector({
        cliType: 'codex',
        model: 'gpt-5.6',
        thinkingLevel: 'xhigh',
        models: CODEX_WITH_56,
      });
      open(fixture);

      // Model pill is present and shows the host-provided label.
      const modelPill = fixture.nativeElement.querySelector(`[data-testid="${modelPillId}"]`);
      expect(modelPill).toBeTruthy();
      expect(modelPill.textContent).toContain('GPT-5.6');
      expect(modelPill.textContent).toContain('default');

      // All four level pills render, xhigh included — sourced from
      // ChatModelOption.thinkingLevels, not any per-model constant.
      const rendered = pillTestids(fixture, 'cac-model-selector-picker-thinking-');
      expect(rendered).toEqual(levelPillIds);
      expect(
        fixture.nativeElement.querySelector('[data-testid="cac-model-selector-picker-thinking-xhigh"]'),
      ).toBeTruthy();
    });

    it('auto-commits gpt-5.6 with its catalog default level (xhigh) on a model click — commit semantics unchanged', async () => {
      // Open on the CLI default so picking gpt-5.6 is a real model change; the
      // CLI is unchanged (codex), so the pick auto-commits and closes.
      const fixture = await createSelector({ cliType: 'codex', model: '', models: CODEX_WITH_56 });
      const committed = vi.fn();
      fixture.componentInstance.commit.subscribe(committed);
      open(fixture);

      const modelPill = fixture.nativeElement.querySelector(
        `[data-testid="${modelPillId}"]`,
      ) as HTMLButtonElement;
      modelPill.click();

      expect(committed).toHaveBeenCalledWith({
        cliType: 'codex',
        model: 'gpt-5.6',
        thinkingLevel: 'xhigh',
      } satisfies ChatModelSelection);
      expect(fixture.componentInstance.pickerOpen()).toBe(false);
    });

    it('auto-commits an explicit xhigh level click for gpt-5.6', async () => {
      const fixture = await createSelector({
        cliType: 'codex',
        model: 'gpt-5.6',
        thinkingLevel: 'high',
        models: CODEX_WITH_56,
      });
      const committed = vi.fn();
      fixture.componentInstance.commit.subscribe(committed);
      open(fixture);

      const xhighPill = fixture.nativeElement.querySelector(
        '[data-testid="cac-model-selector-picker-thinking-xhigh"]',
      ) as HTMLButtonElement;
      xhighPill.click();

      expect(committed).toHaveBeenCalledWith({
        cliType: 'codex',
        model: 'gpt-5.6',
        thinkingLevel: 'xhigh',
      } satisfies ChatModelSelection);
    });

    it('leaves no ghost gpt-5.6 pill when the catalog omits it', async () => {
      const fixture = await createSelector({
        cliType: 'codex',
        model: '',
        models: CODEX_WITHOUT_56,
      });
      open(fixture);

      // No pill, and the draft catalog genuinely does not list it.
      expect(fixture.nativeElement.querySelector(`[data-testid="${modelPillId}"]`)).toBeNull();
      expect(fixture.componentInstance.draftAvailableModels().map((m) => m.id)).not.toContain(
        'gpt-5.6',
      );
      // The only concrete pill is the model the catalog does report.
      expect(pillTestids(fixture, 'cac-model-selector-picker-model-')).toEqual([
        'cac-model-selector-picker-model-default',
        'cac-model-selector-picker-model-gpt-5-codex',
      ]);
    });

    it('falls the trigger chip back to a readable label for the unknown gpt-5.6 id', async () => {
      // shortModelLabel has no gpt rule; the id passes through unchanged, which
      // is a readable fallback rather than an empty/crashing chip.
      const fixture = await createSelector({
        cliType: 'codex',
        model: 'gpt-5.6',
        models: CODEX_WITH_56,
      });
      const chip = fixture.nativeElement.querySelector(
        '[data-testid="cac-model-selector-trigger"]',
      );
      expect(chip.textContent).toContain('gpt-5.6');
    });

    it('falls a labelless catalog entry back to its id in the pill', async () => {
      // A host may surface a brand-new id before it has a friendly label.
      const fixture = await createSelector({
        cliType: 'codex',
        model: '',
        models: [{ id: 'gpt-5.6', isDefault: true }] satisfies ChatModelOption[],
      });
      open(fixture);
      const pill = fixture.nativeElement.querySelector(`[data-testid="${modelPillId}"]`);
      expect(pill).toBeTruthy();
      expect(pill.textContent).toContain('gpt-5.6');
    });
  });
});
