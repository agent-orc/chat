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
import { AnchoredPopoverDirective, TooltipDirective } from 'coding-agent-chat/shared';
import { ChatPermissionOption } from 'coding-agent-chat/core';

/**
 * Permission / sandbox-mode select for the composer footer: a chip showing
 * the current mode that opens a popover listing all modes with their
 * descriptions. Selecting a mode commits immediately and closes.
 *
 * Presentational only — the host supplies `options` (its own permission
 * vocabulary, e.g. yolo / workspace-write / read-only) and applies the
 * selection wherever it belongs (per run, per project, per session).
 */
@Component({
  selector: 'cac-permission-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TooltipDirective, AnchoredPopoverDirective],
  templateUrl: './permission-select.component.html',
  styleUrls: ['./permission-select.component.scss'],
})
export class PermissionSelectComponent {
  readonly options = input<readonly ChatPermissionOption[]>([]);
  /** Id of the currently active option. */
  readonly value = input<string | null>(null);
  readonly disabled = input<boolean>(false);
  /** Tooltip reason shown when `disabled` is true. */
  readonly disabledReason = input<string | null>(null);
  readonly eyebrow = input<string>('Permissions');
  readonly triggerTestid = input<string>('cac-permission-select-trigger');
  readonly pickerTestidPrefix = input<string>('cac-permission-select-picker');

  /** Emitted with the option id when the user picks a mode. */
  readonly valueChange = output<string>();

  readonly pickerOpen = signal<boolean>(false);

  private readonly triggerBtnRef = viewChild<ElementRef<HTMLButtonElement>>('triggerBtn');

  readonly current = computed<ChatPermissionOption | null>(() => {
    const id = this.value();
    if (!id) return null;
    return this.options().find((o) => o.id === id) ?? null;
  });

  readonly chipLabel = computed<string>(() => this.current()?.label ?? 'Permissions');

  readonly warnTone = computed<boolean>(() => this.current()?.tone === 'warn');

  readonly tooltip = computed<string>(() => {
    const reason = this.disabled() ? this.disabledReason() : null;
    if (reason) return reason;
    const current = this.current();
    if (!current) return 'Choose the permission mode';
    return current.description
      ? `${current.label} — ${current.description}`
      : current.label;
  });

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.pickerOpen()) this.closePicker();
  }

  openPicker(event: MouseEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    event.stopPropagation();
    this.pickerOpen.set(true);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
    queueMicrotask(() => this.triggerBtnRef()?.nativeElement.focus());
  }

  onOptionClick(id: string): void {
    if (id !== this.value()) this.valueChange.emit(id);
    this.closePicker();
  }

  onBackdropClick(): void {
    this.closePicker();
  }
}
