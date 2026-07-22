import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { modelLevelIndicator } from 'coding-agent-chat/core';

/** Compact, shared model-family and thinking-level marker for chat surfaces. */
@Component({
  selector: 'cac-model-level-indicator', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (data(); as indicator) { <span class="model-level" [attr.data-family]="indicator.family" [attr.aria-label]="indicator.label" [attr.title]="indicator.label" data-testid="model-level-indicator"><span class="model-level__code">{{ indicator.code }}</span>@if (indicator.level) { <span class="model-level__level">{{ indicator.level }}</span> }</span> }`,
  styles: [`:host { display:inline-flex; vertical-align:middle; } .model-level { display:inline-flex; align-items:center; gap:2px; white-space:nowrap; font:700 9px/1 var(--font-mono,ui-monospace,SFMono-Regular,monospace); letter-spacing:.055em; color:var(--model-level-color,#94a3b8); } .model-level__code { padding:2px 4px; border:1px solid color-mix(in srgb,currentColor 52%,transparent); border-radius:3px; background:color-mix(in srgb,currentColor 12%,transparent); } .model-level__level { min-width:13px; padding:2px 3px; border-radius:3px; background:color-mix(in srgb,currentColor 22%,transparent); text-align:center; } .model-level[data-family='claude'] { --model-level-color:var(--model-family-claude,#d97757); } .model-level[data-family='codex'] { --model-level-color:var(--model-family-codex,#38bdf8); } .model-level[data-family='gemini'] { --model-level-color:var(--model-family-gemini,#a78bfa); } .model-level[data-family='openai'] { --model-level-color:var(--model-family-openai,#4ec9b0); }`],
})
export class ModelLevelIndicatorComponent {
  readonly model = input<string | null>(null);
  readonly thinking = input<string | null>(null);
  readonly data = computed(() => modelLevelIndicator(this.model(), this.thinking()));
}
