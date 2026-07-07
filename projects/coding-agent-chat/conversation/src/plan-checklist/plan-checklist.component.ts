import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PlanItem, PlanItemStatus } from 'coding-agent-chat/core';

/**
 * Renders an agent task plan (`plan.update` snapshot) as a live checklist:
 * a progress count plus one row per item with a status glyph. The
 * conversation view coalesces a run's plan snapshots into a single instance
 * of this component, so it updates in place — items tick over from pending →
 * in-progress → completed as the agent works, rather than stacking snapshots.
 *
 * Presentational only: it takes the latest `items` array and draws it.
 */
@Component({
  selector: 'cac-plan-checklist',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-checklist.component.html',
  styleUrl: './plan-checklist.component.scss',
})
export class PlanChecklistComponent {
  readonly items = input.required<readonly PlanItem[]>();

  /** Completed items over total — the "2/4" progress badge. */
  readonly doneCount = computed<number>(() =>
    this.items().filter((i) => i.status === 'completed').length,
  );

  /** True while at least one item is still open (nothing in progress/pending left). */
  readonly allDone = computed<boolean>(() => {
    const items = this.items();
    return items.length > 0 && items.every((i) => i.status === 'completed' || i.status === 'cancelled');
  });

  glyph(status: PlanItemStatus): string {
    switch (status) {
      case 'completed': return '☑';
      case 'in_progress': return '⟳';
      case 'cancelled': return '⊘';
      default: return '☐';
    }
  }
}
