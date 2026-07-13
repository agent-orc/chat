import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { AnchoredPopoverDirective, TooltipDirective } from 'coding-agent-chat/shared';
import {
  ChatCliOption,
  ChatModelOption,
  ChatModelSelection,
  shortModelLabel,
} from 'coding-agent-chat/core';

/**
 * Unified CLI + model + thinking-level selector for the composer footer:
 * a chip that opens a popover with a row of CLI pills, a column of model
 * pills, and (when the model supports it) a row of level pills.
 *
 * Ported from the host app's `app-cli-model-selector`, made host-agnostic:
 * the catalog is not fetched here. The host supplies `models` (the catalog
 * for the CLI it was last asked about) plus `catalogLoading` / `catalogError`,
 * and reacts to `catalogRequested` / `refreshRequested` by loading data.
 *
 * Commit semantics mirror the original: selecting a model or level without
 * first changing the CLI auto-commits; touching the CLI keeps the popover
 * open until Done so both fields commit atomically. `model === ''` means
 * "CLI default".
 */
@Component({
  selector: 'cac-model-selector',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TooltipDirective, AnchoredPopoverDirective],
  templateUrl: './model-selector.component.html',
  styleUrls: ['./model-selector.component.scss'],
})
export class ModelSelectorComponent {
  /** Selectable CLIs, in display order. */
  readonly cliOptions = input<readonly ChatCliOption[]>([]);
  readonly cliType = input<string | null>(null);
  readonly model = input<string | null>(null);
  readonly thinkingLevel = input<string | null>(null);
  /** Catalog for the CLI named by the latest `catalogRequested` emission. */
  readonly models = input<readonly ChatModelOption[]>([]);
  /** True while the host is loading the catalog. */
  readonly catalogLoading = input<boolean>(false);
  /** Host-provided error text; renders in place of the model list. */
  readonly catalogError = input<string | null>(null);
  readonly disabled = input<boolean>(false);
  /** Tooltip reason shown when `disabled` is true. */
  readonly disabledReason = input<string | null>(null);
  /** Eyebrow above the current value in the popover header. */
  readonly eyebrow = input<string>('Configure agent');
  /** Override the default chip aria-label ("Model: cli · model"). */
  readonly ariaLabelOverride = input<string | null>(null);
  /** Override the default chip tooltip. Falls back to the canonical "cli · model" text. */
  readonly tooltipOverride = input<string | null>(null);
  readonly triggerTestid = input<string>('cac-model-selector-trigger');
  readonly pickerTestidPrefix = input<string>('cac-model-selector-picker');

  /** Atomic commit: emitted from Done or from an auto-commit on a pill click. */
  readonly commit = output<ChatModelSelection>();
  readonly cliTypeChange = output<string>();
  readonly modelChange = output<string>();
  readonly thinkingLevelChange = output<string | null>();
  /**
   * Asks the host to (re)load the catalog for a CLI — emitted when the
   * picker opens and whenever a CLI pill is clicked. The host answers by
   * updating `models` / `catalogLoading` / `catalogError`.
   */
  readonly catalogRequested = output<string>();
  /** Explicit "Refresh" affordance in the popover footer. */
  readonly refreshRequested = output<string>();

  readonly pickerOpen = signal<boolean>(false);

  /** Draft state initialised when the picker opens. */
  readonly draftCliType = signal<string | null>(null);
  readonly draftModel = signal<string>('');
  readonly draftThinkingLevel = signal<string | null>(null);
  private readonly draftModels = signal<readonly ChatModelOption[]>([]);
  /**
   * True while `draftModel` reflects a deliberate value a late catalog answer
   * must not overwrite — the committed value on open (including `''` = CLI
   * default), or an explicit user pick. Only a CLI switch (which resets the
   * draft) clears it, so the catalog default is auto-selected exactly once,
   * for the freshly chosen CLI, and never clobbers a pinned choice.
   */
  private readonly draftModelPinned = signal<boolean>(true);

  private readonly triggerBtnRef = viewChild<ElementRef<HTMLButtonElement>>('triggerBtn');

  readonly effectiveDisabledReason = computed<string | null>(() => {
    if (!this.disabled()) return null;
    return this.disabledReason() ?? 'Stop the run first to change the model.';
  });

  readonly displayName = computed<string>(() => shortModelLabel(this.model()));

  readonly cliIcon = computed<string>(() => {
    const t = this.cliType();
    const opt = t ? this.cliOptions().find((o) => o.id === t) : undefined;
    return opt?.icon ?? '·';
  });

  readonly currentBadgeText = computed<string>(() =>
    this.badgeText(this.cliType(), this.model(), this.thinkingLevel()),
  );

  readonly draftHeaderText = computed<string>(() => {
    const m = this.draftModel();
    return this.badgeText(this.draftCliType(), m.length > 0 ? m : null, this.draftThinkingLevel());
  });

  readonly tooltip = computed<string>(() => {
    const override = this.tooltipOverride();
    if (override !== null) return override;
    const base = this.currentBadgeText();
    const reason = this.effectiveDisabledReason();
    if (reason) return `${base}\n${reason}`;
    return `${base} - click to change`;
  });

  readonly ariaLabel = computed<string>(
    () => this.ariaLabelOverride() ?? `Model: ${this.currentBadgeText()}`,
  );

  readonly draftAvailableModels = computed<readonly ChatModelOption[]>(() => this.draftModels());

  readonly hasChanges = computed<boolean>(() => {
    if (!this.pickerOpen()) return false;
    const cliChanged = this.draftCliType() !== this.cliType();
    const modelInput = (this.model() ?? '').trim();
    const modelChanged = this.draftModel() !== modelInput;
    const currentLevel = this.normalizeThinkingLevel(this.draftModel(), this.thinkingLevel());
    const thinkingChanged = this.draftThinkingLevel() !== currentLevel;
    return cliChanged || modelChanged || thinkingChanged;
  });

  readonly draftSelectedModel = computed<ChatModelOption | null>(() => {
    const id = this.draftModel();
    if (!id) return null;
    return this.draftModels().find((m) => m.id === id) ?? null;
  });

  readonly draftThinkingLevels = computed<readonly string[]>(
    () => this.draftSelectedModel()?.thinkingLevels ?? [],
  );

  constructor() {
    // A host can become read-only while this popover is already open (for
    // example when a task is delivered in another tab). Close immediately so
    // stale draft controls cannot remain interactive.
    effect(() => {
      if (!this.disabled() || !this.pickerOpen()) return;
      untracked(() => this.closePicker());
    });
    // Keep the draft catalog in sync with the host-provided `models` input
    // while the picker is open — the host answers `catalogRequested`
    // asynchronously, so fresh entries land after the popover is visible.
    effect(() => {
      const models = this.models();
      if (!this.pickerOpen()) return;
      untracked(() => this.applyCatalog(models));
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.pickerOpen()) this.closePicker();
  }

  openPicker(event: MouseEvent): void {
    if (this.effectiveDisabledReason() !== null) return;
    event.preventDefault();
    event.stopPropagation();
    const currentCli = this.cliType();
    const currentModel = (this.model() ?? '').trim();
    this.draftCliType.set(currentCli);
    this.draftModel.set(currentModel);
    this.draftModelPinned.set(true);
    this.draftModels.set(this.selectableModels(this.models()));
    this.draftThinkingLevel.set(this.normalizeThinkingLevel(currentModel, this.thinkingLevel()));
    this.pickerOpen.set(true);
    if (currentCli) this.catalogRequested.emit(currentCli);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
    queueMicrotask(() => this.triggerBtnRef()?.nativeElement.focus());
  }

  onCliPillClick(id: string): void {
    if (id !== this.draftCliType()) {
      this.draftCliType.set(id);
      this.draftModels.set([]);
      this.draftModel.set('');
      this.draftThinkingLevel.set(null);
      // Draft was reset for the new CLI — let its catalog default fill in.
      this.draftModelPinned.set(false);
    }
    this.catalogRequested.emit(id);
  }

  onCliPillKeydown(current: string, event: KeyboardEvent): void {
    const ids = this.cliOptions().map((o) => o.id);
    this.moveRadioSelection(event, ids, current, (next) => this.onCliPillClick(next));
  }

  onModelPillClick(modelId: string): void {
    const previous = this.draftThinkingLevel();
    this.draftModel.set(modelId);
    this.draftModelPinned.set(true);
    this.draftThinkingLevel.set(this.normalizeThinkingLevel(modelId, previous));
    if (this.draftCliType() === this.cliType()) {
      this.onDoneClick();
    }
  }

  onDefaultModelClick(): void {
    this.draftModel.set('');
    this.draftModelPinned.set(true);
    this.draftThinkingLevel.set(null);
    if (this.draftCliType() === this.cliType()) {
      this.onDoneClick();
    }
  }

  onModelPillKeydown(current: string, event: KeyboardEvent): void {
    const ids = ['', ...this.draftModels().map((m) => m.id)];
    this.moveRadioSelection(event, ids, current, (next) => {
      if (next === '') this.onDefaultModelClick();
      else this.onModelPillClick(next);
    });
  }

  onThinkingLevelPillClick(level: string): void {
    this.draftThinkingLevel.set(level);
    if (this.draftCliType() === this.cliType()) {
      this.onDoneClick();
    }
  }

  onThinkingLevelPillKeydown(current: string, event: KeyboardEvent): void {
    this.moveRadioSelection(event, [...this.draftThinkingLevels()], current, (next) =>
      this.onThinkingLevelPillClick(next),
    );
  }

  onDoneClick(): void {
    if (!this.pickerOpen()) return;
    if (this.disabled()) {
      this.closePicker();
      return;
    }
    const cli = this.draftCliType();
    if (!cli) {
      this.closePicker();
      return;
    }
    if (this.hasChanges()) {
      const change: ChatModelSelection = {
        cliType: cli,
        model: this.draftModel(),
        thinkingLevel: this.draftThinkingLevel(),
      };
      if (cli !== this.cliType()) this.cliTypeChange.emit(cli);
      this.modelChange.emit(change.model);
      this.thinkingLevelChange.emit(change.thinkingLevel);
      this.commit.emit(change);
    }
    this.closePicker();
  }

  onCancelClick(): void {
    this.closePicker();
  }

  onBackdropClick(): void {
    this.closePicker();
  }

  onRefreshClick(): void {
    const cli = this.draftCliType();
    if (!cli) return;
    this.refreshRequested.emit(cli);
  }

  cliLabel(id: string): string {
    return this.cliOptions().find((o) => o.id === id)?.label ?? id;
  }

  cliOptionIcon(id: string): string {
    return this.cliOptions().find((o) => o.id === id)?.icon ?? '·';
  }

  private applyCatalog(models: readonly ChatModelOption[]): void {
    const selectable = this.selectableModels(models);
    this.draftModels.set(selectable);
    const current = this.draftModel();
    // `''` means "CLI default" — always a valid selection, never a
    // "nothing picked yet" placeholder. A concrete id is valid only while
    // the catalog still lists it.
    const stillValid = current === '' || selectable.some((m) => m.id === current);
    // A pinned, still-valid draft is what the user is deliberately looking at
    // (the committed value on open, or an explicit pick). Preserve it — a late
    // catalog answer must not silently change what Done will commit.
    if (this.draftModelPinned() && stillValid) {
      this.draftThinkingLevel.set(this.normalizeThinkingLevel(current, this.draftThinkingLevel()));
      return;
    }
    const def = selectable.find((m) => m.isDefault);
    this.draftModel.set(def ? def.id : '');
    this.draftThinkingLevel.set(def?.defaultThinkingLevel ?? null);
  }

  private selectableModels(models: readonly ChatModelOption[]): readonly ChatModelOption[] {
    return models.filter((m) => m.available !== false);
  }

  private normalizeThinkingLevel(modelId: string, requested: string | null): string | null {
    if (!modelId) return null;
    const info = this.draftModels().find((m) => m.id === modelId);
    const levels = info?.thinkingLevels ?? [];
    if (levels.length === 0) return null;
    if (requested && levels.includes(requested)) return requested;
    return info?.defaultThinkingLevel ?? levels[0] ?? null;
  }

  private badgeText(cliType: string | null, model: string | null, thinkingLevel?: string | null): string {
    const cli = cliType ? this.cliLabel(cliType) : 'no CLI';
    const m = model && model.trim() ? model.trim() : 'CLI default';
    return thinkingLevel ? `${cli} · ${m} · ${thinkingLevel}` : `${cli} · ${m}`;
  }

  private moveRadioSelection<T>(
    event: KeyboardEvent,
    items: readonly T[],
    current: T,
    commitFn: (next: T) => void,
  ): void {
    if (items.length === 0) return;
    const key = event.key;
    const forward = key === 'ArrowRight' || key === 'ArrowDown';
    const backward = key === 'ArrowLeft' || key === 'ArrowUp';
    const home = key === 'Home';
    const end = key === 'End';
    if (!forward && !backward && !home && !end) return;

    event.preventDefault();
    event.stopPropagation();
    const currentIndex = Math.max(0, items.findIndex((item) => item === current));
    let nextIndex = currentIndex;
    if (forward) nextIndex = (currentIndex + 1) % items.length;
    if (backward) nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (home) nextIndex = 0;
    if (end) nextIndex = items.length - 1;
    commitFn(items[nextIndex]);
  }
}
