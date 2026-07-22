import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

import { RoleBadgeComponent } from 'coding-agent-chat/composer';
import { MarkdownViewComponent } from 'coding-agent-chat/markdown';
import { ModelLevelIndicatorComponent } from 'coding-agent-chat/shared';

/**
 * Shared chat-row presentation. Renders one message-or-event row inside
 * any chat surface: a task/orchestrator chat timeline or the virtualised
 * project chat list (`<cac-project-chat-list>`). The row carries the bits
 * every surface cares about — role badge, kind label, timestamp, markdown
 * body — so each consumer can lift its inline `<article>` markup into one
 * place.
 *
 * Consumer message shapes diverge (`ChatMessage` vs `ProjectChatTurn`);
 * each consumer adapts its payload to this row's input shape before
 * binding.
 */
export type ChatRowAuthor =
  | 'user'
  | 'orchestrator'
  | 'agent'
  | 'supervisor'
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'system';

export interface ChatRowInput {
  /** Backing model id (for tracking / data-testid). */
  id: string;
  author: ChatRowAuthor;
  /** Optional override for display label (e.g. show "You" for user). */
  authorLabel?: string;
  /** Optional kind/category, rendered as a monospace chip after the author. */
  kind?: string | null;
  /** Optional file refs rendered alongside the role badge. */
  refs?: readonly string[] | null;
  /** Attributed model for this row's run. */
  model?: string | null;
  /** Attributed thinking level for this row's run. */
  thinkingLevel?: string | null;
  /** ISO 8601. */
  ts: string;
  /** Markdown source (rendered to HTML). For pre-escaped/plain text, pass
   *  `bodyHtml` instead and leave this empty. */
  body?: string;
  /** Already-sanitized HTML; takes precedence over `body`. */
  bodyHtml?: SafeHtml | string | null;
  /** Reserved for future "show more" collapsing. */
  collapsed?: boolean;
  /** True when the row is in the user variant (different bubble colour). */
  userVariant?: boolean;
  /** True when this row is an event card (dashed border, dimmer body). */
  eventVariant?: boolean;
  /** Temporary highlight state (e.g. just navigated-to in search). */
  flash?: boolean;
}

@Component({
  selector: 'cac-chat-row',
  standalone: true,
  imports: [RoleBadgeComponent, MarkdownViewComponent, ModelLevelIndicatorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat-row.component.html',
  styleUrl: './chat-row.component.scss',
})
export class ChatRowComponent {
  readonly row = input.required<ChatRowInput>();

  private readonly sanitizer = inject(DomSanitizer);

  /**
   * Pre-sanitised HTML when the caller passes `bodyHtml` directly. The
   * markdown render path goes through `<cac-markdown>` instead so chat
   * rows share the canonical surface with every other markdown host.
   */
  readonly preRenderedHtml = computed<SafeHtml | null>(() => {
    const r = this.row();
    if (r.bodyHtml == null) return null;
    return typeof r.bodyHtml === 'string'
      ? this.sanitizer.bypassSecurityTrustHtml(r.bodyHtml)
      : r.bodyHtml;
  });

  readonly formattedTs = computed<string>(() => {
    const ts = this.row().ts;
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  });
}
