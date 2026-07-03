import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Tiny, dependency-free syntax highlighter for the site's static snippets.
 * The input is trusted (authored constants in this repo, never user input),
 * so the highlighted HTML may bypass sanitization after escaping.
 */
const TS_KEYWORDS =
  'import|export|from|const|let|var|function|return|new|interface|implements|extends|type|class|readonly|public|private|protected|this|if|else|for|of|in|async|await|true|false|null|undefined|void|typeof|provide|useClass|useExisting';

const TS_PATTERN = new RegExp(
  [
    String.raw`(\/\*[\s\S]*?\*\/|\/\/[^\n]*)`, // 1 comment
    String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|` + '`(?:[^`\\\\]|\\\\.)*`)', // 2 string
    String.raw`(@[A-Za-z_]\w*)`, // 3 decorator / scoped-package head
    String.raw`\b(${TS_KEYWORDS})\b`, // 4 keyword
    String.raw`(\b\d+(?:\.\d+)?\b)`, // 5 number
  ].join('|'),
  'g',
);

const SHELL_PATTERN = new RegExp(
  [
    String.raw`(#[^\n]*)`, // 1 comment
    String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")`, // 2 string
    String.raw`(\b\B)`, // 3 never matches — keeps group indices aligned with TS
    String.raw`(\b\B)`, // 4
    String.raw`(\b\B)`, // 5
  ].join('|'),
  'g',
);

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlight(code: string, lang: string): string {
  const pattern = lang === 'sh' ? SHELL_PATTERN : TS_PATTERN;
  pattern.lastIndex = 0;
  let html = '';
  let last = 0;
  for (let m = pattern.exec(code); m !== null; m = pattern.exec(code)) {
    html += escapeHtml(code.slice(last, m.index));
    const [full, comment, str, deco, keyword, num] = m;
    if (comment) html += `<span class="tok-comment">${escapeHtml(comment)}</span>`;
    else if (str) html += `<span class="tok-string">${escapeHtml(str)}</span>`;
    else if (deco) html += `<span class="tok-decorator">${escapeHtml(deco)}</span>`;
    else if (keyword) html += `<span class="tok-keyword">${escapeHtml(keyword)}</span>`;
    else if (num) html += `<span class="tok-number">${escapeHtml(num)}</span>`;
    else html += escapeHtml(full);
    last = m.index + full.length;
    if (full.length === 0) pattern.lastIndex += 1; // safety against zero-width loops
  }
  html += escapeHtml(code.slice(last));
  return html;
}

/** Code snippet card with a language label and a copy-to-clipboard button. */
@Component({
  selector: 'site-code',
  template: `
    <figure class="code-card">
      @if (label()) {
        <figcaption class="code-card__head">
          <span class="code-card__dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="code-card__label">{{ label() }}</span>
          <button type="button" class="code-card__copy" (click)="copy()">
            {{ copied() ? 'Copied ✓' : 'Copy' }}
          </button>
        </figcaption>
      } @else {
        <button type="button" class="code-card__copy code-card__copy--floating" (click)="copy()">
          {{ copied() ? 'Copied ✓' : 'Copy' }}
        </button>
      }
      <pre class="code-card__pre"><code [innerHTML]="html()"></code></pre>
    </figure>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeBlockComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly code = input.required<string>();
  /** `ts` (default) or `sh`. */
  readonly lang = input<'ts' | 'sh'>('ts');
  /** Optional header label, e.g. a file name. */
  readonly label = input<string>('');

  protected readonly copied = signal(false);

  protected readonly html = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(highlight(this.code(), this.lang())),
  );

  protected copy(): void {
    const text = this.code();
    void navigator.clipboard?.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    });
  }
}
