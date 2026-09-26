import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { TurnMetadataChip } from 'coding-agent-chat/core';

/** Compact, readable line shared by both chat renderers. */
@Component({
  selector: 'cac-turn-metadata-line',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (chips().length) {
      <div
        class="turn-metadata"
        role="group"
        aria-label="Turn metadata"
        data-testid="turn-metadata-line"
      >
        @for (chip of chips(); track chip.label) {
          <span
            class="turn-metadata__item"
            [class.turn-metadata__item--model]="chip.label === 'Model'"
            [attr.aria-label]="chip.title"
            [title]="chip.title"
          >
            <span class="turn-metadata__label">{{ chip.label }}</span>
            <span class="turn-metadata__value">{{ chip.value }}</span>
          </span>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .turn-metadata {
        display: flex;
        flex-wrap: wrap;
        gap: var(--studio-spacing-2, 8px);
        padding-block: var(--studio-spacing-1, 4px);
        color: var(--studio-fg-dim, #94a3b8);
        font: 11px/1.4 var(--font-ui, sans-serif);
      }
      .turn-metadata__item {
        display: inline-flex;
        gap: var(--studio-spacing-1, 4px);
        align-items: baseline;
        font-variant-numeric: tabular-nums;
      }
      .turn-metadata__item--model {
        padding-inline: var(--studio-spacing-1, 4px);
        border: 1px solid var(--studio-border, rgba(255, 255, 255, 0.12));
        border-radius: var(--studio-radius-sm, 4px);
        background: var(--studio-bg-hover, rgba(255, 255, 255, 0.04));
      }
      .turn-metadata__label {
        color: var(--studio-fg-muted, #64748b);
      }
      .turn-metadata__value {
        color: var(--studio-fg, #e2e8f0);
      }
    `,
  ],
})
export class TurnMetadataLineComponent {
  readonly chips = input.required<readonly TurnMetadataChip[]>();
}
