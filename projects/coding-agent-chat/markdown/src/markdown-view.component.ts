import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  type ComponentRef,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { MarkdownImageLightboxDirective } from 'coding-agent-chat/shared';
import { CHAT_TASK_REFERENCE_PROVIDER } from './chat-task-reference.token';
import {
  INLINE_REFERENCE_RENDERERS,
  type InlineReferenceMatcher,
} from './inline-reference.token';
import {
  INLINE_REF_GROUPS_ATTR,
  INLINE_REF_MARKER_ATTR,
  INLINE_REF_TOKEN_ATTR,
  injectInlineReferenceMarkers,
  linkTaskReferencesInHtml,
  markdownToHtml,
  sanitizeHtml,
  type InlineReferenceMatch,
  type MarkdownImageOptions,
} from './markdown-utils';

/**
 * Canonical markdown render surface. Replaces the
 * `bypassSecurityTrustHtml(markdownToHtml(...))` + `.markdown-body` +
 * `appMarkdownLightbox` boilerplate that every host used to repeat.
 *
 * Two input paths:
 *   [source]  raw markdown -> client-side rendering via markdown-utils
 *   [html]    pre-rendered HTML string (F22 backend projection) -> sanitised
 *             and embedded as-is
 *
 * Both paths produce the same `.markdown-body` container, so styling and
 * lightbox behaviour stay identical regardless of which side did the
 * render. When both inputs are set, [html] wins so server output is
 * preferred once F22 lands per-job.
 *
 * The host background stays transparent; consumers paint the surrounding
 * surface (chat bubble, prompt-history card, info-button modal). The
 * grey-on-grey "layer around headings" regression came from per-host
 * background drift on the inline markdown div; centralising the wrapper
 * here fixes it once.
 *
 * Canonical contract (this is the single markdown render surface):
 *   - Selector is `app-markdown` (file: markdown-view.component.ts). No
 *     other component may call `marked()` / `markdownToHtml()` or bind
 *     `[innerHTML]` for *markdown* output — route prose through here so
 *     sanitisation, the `.markdown-body` typography (light + dark), the
 *     image lightbox, and link/code handling stay identical everywhere.
 *   - Non-markdown HTML (syntax-highlighted diffs, search-hit `<b>`
 *     snippets, plain-text-escaped strings) is *not* this component's
 *     job and legitimately stays on its own `[innerHTML]` path.
 *
 * Variants (the surface's "modes"):
 *   - default   full-document prose (task description, lane-info modal,
 *               project steering docs). Heading underlines on.
 *   - [dense]   compact column width (chat, activity-log, prompt-history):
 *               smaller font, tighter rhythm, no h1/h2 underlines.
 *   - [editor]  the markdown-rich-editor live-preview surface: min-height
 *               + caret so the contenteditable doesn't collapse.
 *
 * Input precedence: [html] (pre-rendered, e.g. F22 server projection)
 * wins over [source] (raw markdown). Both end in the same `.markdown-body`
 * container so styling is render-path-independent.
 *
 * Inline-reference extension point: hosts may register
 * {@link INLINE_REFERENCE_RENDERERS} to slot live components in place of
 * matched tokens (task keys, ticket ids, URLs) found in the prose — never
 * inside code fences or links. Inert by default (empty matcher set), so other
 * hosts see no behaviour change and pay no cost.
 */
@Component({
  selector: 'cac-markdown',
  standalone: true,
  imports: [MarkdownImageLightboxDirective],
  templateUrl: './markdown-view.component.html',
  styleUrl: './markdown-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownViewComponent {
  /** Raw markdown source. Rendered to HTML via the shared markdown-utils. */
  readonly source = input<string | null | undefined>('');

  /**
   * Already-rendered HTML (e.g. produced server-side by F22). When set,
   * this takes precedence over `source` and is sanitised + embedded
   * without re-running the markdown parser. Lets one component carry
   * both render paths without callers having to switch components.
   */
  readonly html = input<string | null | undefined>(null);

  /**
   * Dense variant for chat-width / activity-log / prompt-history columns:
   * smaller font, tighter heading rhythm, no h1/h2 underlines so the
   * layout doesn't fragment in a narrow column.
   */
  readonly dense = input<boolean>(false);

  /**
   * Editor variant — used by the markdown-rich-editor preview surface.
   * Adds a small min-height so the contenteditable doesn't collapse
   * before the user has typed anything and re-enables the caret.
   */
  readonly editor = input<boolean>(false);

  /** Forwarded to markdown-utils for the chat surface's numbered-code shape. */
  readonly codeLineNumbers = input<boolean>(false);
  readonly codeLineNumberThreshold = input<number | undefined>(undefined);

  /**
   * Optional rewriter for `<img src=...>` URLs. Used by the prompt-history
   * + protocol path so `attachments/foo.png` resolves to the job-folder
   * API URL.
   */
  readonly resolveImageSrc = input<((src: string) => string) | null>(null);

  /** Optional test hook for the inner body div. */
  readonly testId = input<string | null>(null);

  private readonly sanitizer = inject(DomSanitizer);
  private readonly taskReferences = inject(CHAT_TASK_REFERENCE_PROVIDER);

  /**
   * Host-registered inline-reference renderers (the generic extension point).
   * A constant injected once — empty by default, so the whole seam is inert
   * (and the hydration effect below is never even registered) for hosts that
   * do not opt in.
   */
  private readonly inlineMatchers = inject(INLINE_REFERENCE_RENDERERS);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly bodyRef = viewChild<ElementRef<HTMLElement>>('body');
  /** Live host components currently slotted into the rendered body. */
  private slotted: ComponentRef<unknown>[] = [];

  constructor() {
    // Zero-cost default: with no matchers registered, nothing to hydrate — so
    // don't even register the after-render effect. Other hosts pay nothing.
    if (this.inlineMatchers.length) {
      afterRenderEffect(() => this.hydrateInlineReferences());
      inject(DestroyRef).onDestroy(() => this.clearSlotted());
    }
  }

  readonly safeHtml = computed<SafeHtml>(() => {
    const references = this.taskReferences.markdownReferences();
    const preRendered = this.html();
    let html: string;
    if (typeof preRendered === 'string') {
      html = sanitizeHtml(linkTaskReferencesInHtml(preRendered, references));
    } else {
      const options: MarkdownImageOptions = { taskReferences: references };
      if (this.codeLineNumbers()) options.codeLineNumbers = true;
      const threshold = this.codeLineNumberThreshold();
      if (threshold != null) options.codeLineNumberThreshold = threshold;
      const resolver = this.resolveImageSrc();
      if (resolver) options.resolveImageSrc = resolver;
      html = markdownToHtml(this.source() ?? '', options);
    }
    // Stamp inert placeholder markers for host inline references (no-op when
    // no matchers are registered, so the output is byte-identical by default).
    if (this.inlineMatchers.length) {
      html = injectInlineReferenceMarkers(html, this.inlineMatchers);
    }
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  /**
   * Replace the placeholder markers stamped by {@link injectInlineReferenceMarkers}
   * with live host components. Runs after every render whose body changed
   * (tracked via `safeHtml()`); old slots are destroyed first so a re-render
   * never leaks a detached component.
   */
  private hydrateInlineReferences(): void {
    // Establish the reactive dependency: re-hydrate whenever the body changes.
    this.safeHtml();
    this.clearSlotted();
    const host = this.bodyRef()?.nativeElement;
    if (!host) return;

    const byId = new Map(this.inlineMatchers.map((m) => [m.id, m]));
    const markers = host.querySelectorAll<HTMLElement>(`[${INLINE_REF_MARKER_ATTR}]`);
    for (const marker of Array.from(markers)) {
      const matcher = byId.get(marker.getAttribute(INLINE_REF_MARKER_ATTR) ?? '');
      if (!matcher) continue;
      const match = readMarkerMatch(marker, matcher);
      const ref = this.viewContainer.createComponent(matcher.component);
      const inputs = matcher.inputs ? matcher.inputs(match) : { token: match.token, match };
      for (const [name, value] of Object.entries(inputs)) {
        // A slot may declare only a subset of the default inputs; ignore the
        // rest instead of throwing so `{ token, match }` fits a token-only
        // component with no custom `inputs` mapper.
        try {
          ref.setInput(name, value);
        } catch {
          /* input not declared on this component — skip it */
        }
      }
      marker.replaceWith(ref.location.nativeElement);
      ref.changeDetectorRef.detectChanges();
      this.slotted.push(ref);
    }
  }

  private clearSlotted(): void {
    for (const ref of this.slotted) ref.destroy();
    this.slotted = [];
  }

  onMarkdownClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>('a[data-task-ref="true"][data-task-key]');
    if (!anchor) return;

    event.preventDefault();
    event.stopPropagation();
    this.taskReferences.openTaskKey(anchor.dataset['taskKey']);
  }
}

/** Rebuild the {@link InlineReferenceMatch} a marker element stands in for. */
function readMarkerMatch(marker: HTMLElement, matcher: InlineReferenceMatcher): InlineReferenceMatch {
  const token = marker.getAttribute(INLINE_REF_TOKEN_ATTR) ?? marker.textContent ?? '';
  let groups: Record<string, string> = {};
  const rawGroups = marker.getAttribute(INLINE_REF_GROUPS_ATTR);
  if (rawGroups) {
    try {
      groups = JSON.parse(rawGroups) as Record<string, string>;
    } catch {
      groups = {};
    }
  }
  return { matcherId: matcher.id, token, groups };
}
