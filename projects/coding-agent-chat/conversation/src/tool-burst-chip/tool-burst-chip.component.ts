import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { ToolBurstEvent, ToolFamily, ToolOutputHit } from 'coding-agent-chat/core';
import { TooltipDirective, type StructuredTooltip } from 'coding-agent-chat/shared';

/**
 * Dense, collapsed-by-default renderer for `ToolBurst` events in the
 * next-gen chat (`Frontend:NextGenChat`). One ToolBurst maps to one row;
 * the row expands into a per-tool details list with file, test, and
 * artifact rollups.
 *
 * The component is intentionally presentational: it takes a `ToolBurstEvent`
 * and emits no events back to the host. Hosts that need "open in Trace"
 * read `event().rawRange` themselves; the chip surfaces the raw range
 * inside the expanded details so the user can see what the row maps to.
 *
 * Visibility is gated upstream by `Frontend:NextGenChat`; the chip itself
 * does not read the flag.
 */
@Component({
  selector: 'cac-tool-burst-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TooltipDirective],
  templateUrl: './tool-burst-chip.component.html',
  styleUrl: './tool-burst-chip.component.scss'
})
export class ToolBurstChipComponent {
  readonly event = input.required<ToolBurstEvent>();
  readonly density = input<'comfortable' | 'compact'>('comfortable');
  readonly initialOpen = input<boolean>(false);
  readonly openSourceLocation = output<ToolOutputHit>();

  readonly open = signal<boolean>(false);
  private readonly expandedCommandOutputs = signal<ReadonlySet<string>>(new Set());

  constructor() {
    queueMicrotask(() => {
      if (this.initialOpen()) this.open.set(true);
      else if (this.event().collapsedByDefault === false) this.open.set(true);
    });
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  readonly failed = computed(() => (this.event().failures ?? 0) > 0);

  readonly familyChips = computed<{ family: ToolFamily; label: string; count: number }[]>(() => {
    const families = this.event().families ?? {};
    const order: ToolFamily[] = ['read', 'search', 'command', 'edit', 'task', 'todo', 'other'];
    const out: { family: ToolFamily; label: string; count: number }[] = [];
    for (const f of order) {
      const count = families[f];
      if (count && count > 0) out.push({ family: f, label: this.familyLabel(f), count });
    }
    return out;
  });

  readonly leadingIcon = computed(() => {
    if (this.failed()) return '❌';
    const top = this.familyChips()[0];
    if (!top) return '🔧';
    return iconFor(top.family);
  });

  // Written-out meaning of the current row's glyph, e.g. "Read - Dateien
  // gelesen". Used in the expanded detail head so the emoji glyph is
  // recognizable by name once the row is open, not only on hover.
  readonly leadingGlyphLabel = computed(() => {
    const entry = glyphEntry(this.leadingIcon());
    return entry ? `${entry.name} — ${entry.meaning}` : '';
  });

  // A single instant-hover legend for the glyph column. The active glyph is
  // emphasized, but the full key is always shown so any row decodes the
  // whole alphabet, not just its own icon.
  readonly glyphTooltip = computed<StructuredTooltip>(() => {
    const active = this.leadingIcon();
    const items = GLYPH_LEGEND.map((e) => {
      const cell = `<code>${e.glyph}</code> ${e.name} - ${e.meaning}`;
      return e.glyph === active ? `<li><strong>${cell}</strong></li>` : `<li>${cell}</li>`;
    }).join('');
    const entry = glyphEntry(active);
    return {
      title: entry ? `${entry.name} - ${entry.meaning}` : 'Tool-Glyphen',
      body: `<ul>${items}</ul>`
    };
  });

  readonly formattedDuration = computed(() => formatBurstDuration(this.event().durationMs ?? 0));

  readonly commands = computed(() => this.event().commands ?? []);

  readonly detailRows = computed<DetailRow[]>(() => {
    const event = this.event();
    const families = event.families ?? {};
    const samples = event.samples ?? {};
    const failures = event.failures ?? 0;
    const rows: DetailRow[] = [];
    const familyOrder: ToolFamily[] = ['read', 'search', 'command', 'edit', 'task', 'todo', 'other'];
    let failuresLeft = failures;
    for (const family of familyOrder) {
      const count = families[family] ?? 0;
      if (count <= 0) continue;
      const sample = samples[family] ?? this.familyLabel(family);
      const familyFailures = Math.min(count, failuresLeft);
      failuresLeft -= familyFailures;
      const status: 'ok' | 'fail' = familyFailures > 0 ? 'fail' : 'ok';
      // One status cell, no duplication: "ok", "ok ×3", "2 fail ×5".
      rows.push({
        family,
        target: sample,
        status,
        statusLabel: status === 'fail' ? `${familyFailures} fail` : 'ok',
        meta: count > 1 ? `×${count}` : ''
      });
    }
    return rows;
  });

  familyLabel(family: ToolFamily): string {
    switch (family) {
      case 'read': return 'read';
      case 'search': return 'search';
      case 'command': return 'shell';
      case 'edit': return 'edit';
      case 'task': return 'task';
      case 'todo': return 'todo';
      default: return 'tool';
    }
  }

  commandKey(index: number): string {
    const command = this.commands()[index];
    return `${index}:${command?.command ?? ''}`;
  }

  isCommandOutputExpanded(index: number): boolean {
    return this.expandedCommandOutputs().has(this.commandKey(index));
  }

  toggleCommandOutput(index: number): void {
    const key = this.commandKey(index);
    const next = new Set(this.expandedCommandOutputs());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.expandedCommandOutputs.set(next);
  }

  commandOutput(commandIndex: number): string {
    const command = this.commands()[commandIndex];
    if (!command) return '';
    if (this.isCommandOutputExpanded(commandIndex)) return command.output;
    return command.output.split(/\r?\n/).slice(0, COMMAND_OUTPUT_PREVIEW_LINES).join('\n');
  }

  commandHiddenLines(commandIndex: number): number {
    const command = this.commands()[commandIndex];
    if (!command || this.isCommandOutputExpanded(commandIndex)) return 0;
    const actualLineCount = command.output ? command.output.split(/\r?\n/).length : 0;
    const total = Math.max(command.outputLineCount, actualLineCount);
    return Math.max(0, total - COMMAND_OUTPUT_PREVIEW_LINES);
  }

  hasCommandOverflow(commandIndex: number): boolean {
    const command = this.commands()[commandIndex];
    if (!command) return false;
    return this.commandHiddenLines(commandIndex) > 0 || command.outputTruncated || this.isCommandOutputExpanded(commandIndex);
  }

  commandToggleLabel(commandIndex: number): string {
    if (this.isCommandOutputExpanded(commandIndex)) return 'show less';
    const hidden = this.commandHiddenLines(commandIndex);
    if (hidden > 0) return `show ${hidden} more lines`;
    return 'show full output';
  }

  shortCommand(command: string): string {
    return command.length > 112 ? `${command.slice(0, 109)}...` : command;
  }

  statusLabel(status: string, exitCode: number | null): string {
    if (exitCode !== null) return `exit ${exitCode}`;
    return status;
  }

  emitSourceLocation(event: MouseEvent, hit: ToolOutputHit): void {
    event.preventDefault();
    event.stopPropagation();
    this.openSourceLocation.emit(hit);
  }
}

interface DetailRow {
  family: ToolFamily;
  target: string;
  status: 'ok' | 'fail';
  statusLabel: string;
  meta: string;
}

const COMMAND_OUTPUT_PREVIEW_LINES = 24;

function iconFor(family: ToolFamily): string {
  switch (family) {
    case 'read': return '📖';
    case 'search': return '🔍';
    case 'command': return '💻';
    case 'edit': return '📝';
    case 'task': return '🤖';
    case 'todo': return '📋';
    default: return '🔧';
  }
}

interface GlyphLegendEntry {
  glyph: string;
  name: string;
  meaning: string;
}

// Complete key for the per-family emoji rendered in `.burst__icon`. Order
// mirrors the family order used elsewhere, with the failure marker last.
const GLYPH_LEGEND: readonly GlyphLegendEntry[] = [
  { glyph: '📖', name: 'Read', meaning: 'Dateien gelesen' },
  { glyph: '🔍', name: 'Search', meaning: 'Suche / grep' },
  { glyph: '💻', name: 'Shell', meaning: 'Kommando ausgeführt' },
  { glyph: '📝', name: 'Edit', meaning: 'Dateien geändert' },
  { glyph: '🤖', name: 'Task', meaning: 'Unteraufgabe / Agent' },
  { glyph: '📋', name: 'Todo', meaning: 'Aufgabenliste' },
  { glyph: '🔧', name: 'Tool', meaning: 'Sonstiges Werkzeug' },
  { glyph: '❌', name: 'Fehler', meaning: 'Tool-Aufruf fehlgeschlagen' }
];

function glyphEntry(glyph: string): GlyphLegendEntry | undefined {
  return GLYPH_LEGEND.find((e) => e.glyph === glyph);
}

function formatBurstDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  if (ms < 1000) return '<1s';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (totalMin < 60) return sec === 0 ? `${totalMin}m` : `${totalMin}m ${sec}s`;
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min === 0 ? `${hr}h` : `${hr}h ${min}m`;
}
