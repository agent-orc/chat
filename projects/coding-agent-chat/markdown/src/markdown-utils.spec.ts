// Covers the pure markdown kernel: markdown -> HTML rendering (GFM, code
// shapes, sanitised links, task-reference linking) and the HTML -> markdown
// serialisation path the rich editor round-trips through.
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, linkTaskReferencesInHtml, markdownToHtml } from './markdown-utils';

describe('markdownToHtml', () => {
  it('renders headings, lists and inline formatting', () => {
    expect(markdownToHtml('# Status\n\n- **Done**\n- `jobId`')).toBe(
      '<h1>Status</h1><ul><li><strong>Done</strong></li><li><code>jobId</code></li></ul>'
    );
  });

  it('escapes raw html before rendering markdown', () => {
    expect(markdownToHtml('Hello <script>alert(1)</script>')).toBe(
      '<p>Hello &lt;script&gt;alert(1)&lt;/script&gt;</p>'
    );
  });

  it('renders standalone image lines as block-level <img>', () => {
    expect(markdownToHtml('Before\n\n![shot](attachments/abc.png)\n\nAfter')).toBe(
      '<p>Before</p><img src="attachments/abc.png" alt="shot"><p>After</p>'
    );
  });

  it('expands attachment refs through resolveImageSrc', () => {
    const html = markdownToHtml('![shot](attachments/abc.png)', {
      resolveImageSrc: (src) =>
        src.startsWith('attachments/') ? `/api/tasks/x/${src}` : src
    });
    expect(html).toBe('<img src="/api/tasks/x/attachments/abc.png" alt="shot">');
  });

  it('renders ordered lists as <ol>', () => {
    expect(markdownToHtml('1. one\n2. two')).toBe(
      '<ol><li>one</li><li>two</li></ol>'
    );
  });

  it('renders GFM tables', () => {
    const html = markdownToHtml('| Field | Value |\n|---|---|\n| ID | ASS-704 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>Field</th>');
    expect(html).toContain('<td>ASS-704</td>');
  });

  it('renders inline links and treats javascript: URLs as unsafe', () => {
    const safe = markdownToHtml('See [docs](https://example.com).');
    expect(safe).toContain('href="https://example.com"');
    expect(safe).toContain('rel="noopener noreferrer"');

    const unsafe = markdownToHtml('[click](javascript:alert(1))');
    expect(unsafe).not.toContain('javascript:');
    expect(unsafe).toContain('href="#"');
  });

  it('treats single-asterisk pairs as italic alongside underscore italic', () => {
    expect(markdownToHtml('a *star* and _under_')).toBe(
      '<p>a <em>star</em> and <em>under</em></p>'
    );
  });

  // ====================================================================
  // Edge-case coverage. These cases drove the activity-log redesign:
  // they're the shapes agents actually emit but the renderer used to
  // mangle. Each test pins the desired output so a regression surfaces
  // here rather than at next user-visible flake.
  // ====================================================================

  describe('edge cases', () => {
    it('renders fenced code blocks verbatim with inner markdown left alone', () => {
      const md = ['Here is some code:', '', '```', 'const x = "**not bold**";', '// comment', '```'].join('\n');
      const html = markdownToHtml(md);
      expect(html).toContain('<pre><code>');
      expect(html).toContain('const x = "**not bold**";');
      expect(html).toContain('// comment');
      // Inside fenced code, ** must NOT have been transformed to <strong>.
      expect(html).not.toContain('<strong>not bold</strong>');
    });

    it('preserves a fenced code block at the end of input (closing fence is the last line)', () => {
      const md = ['```', 'final = 1', '```'].join('\n');
      expect(markdownToHtml(md)).toBe('<pre><code>final = 1</code></pre>');
    });

    it('handles a paragraph containing both bold and inline code without crossing them', () => {
      // Past regression: the global ** regex chewed across inline code spans.
      const html = markdownToHtml('Use the **`--resume`** flag to continue.');
      expect(html).toContain('<strong><code>--resume</code></strong>');
    });

    it('handles a long URL inside a paragraph without breaking the link rendering', () => {
      const md = 'See [docs](https://example.com/path/with/lots/of/segments?query=very-long-string-of-text-that-could-trigger-wrapping#fragment).';
      const html = markdownToHtml(md);
      expect(html).toContain('href="https://example.com/path/with/lots/of/segments?query=very-long-string-of-text-that-could-trigger-wrapping#fragment"');
      expect(html).toContain('>docs</a>');
    });

    it('renders bullet lists with bold + code inside list items', () => {
      const md = '- **Done** committed `37c05c2`\n- **Open**: see [issue](https://example.com/1)';
      const html = markdownToHtml(md);
      expect(html).toContain('<ul>');
      expect(html).toContain('<li><strong>Done</strong> committed <code>37c05c2</code></li>');
      expect(html).toContain('<li><strong>Open</strong>: see <a href="https://example.com/1"');
    });

    it('separates a bullet list from an ordered list when they are adjacent', () => {
      // Past failure mode: switching from `-` to `1.` left the <ul> open.
      const md = '- one\n- two\n1. first\n2. second';
      const html = markdownToHtml(md);
      // Each list closes before the next opens.
      expect(html).toMatch(/<\/ul>\s*<ol>/);
    });

    it('surrounds an embedded image with the surrounding text paragraphs', () => {
      const md = ['Above the image.', '', '![shot](attachments/abc.png)', '', 'Below the image.'].join('\n');
      const html = markdownToHtml(md);
      expect(html).toBe(
        '<p>Above the image.</p><img src="attachments/abc.png" alt="shot"><p>Below the image.</p>'
      );
    });

    it('escapes ampersands in URLs without double-escaping', () => {
      const html = markdownToHtml('[search](https://example.com/?a=1&b=2)');
      // Output should have `&amp;` once (HTML-escaped), not `&amp;amp;`.
      expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
      expect(html).not.toContain('&amp;amp;');
    });

    it('does not turn intra-word underscores into emphasis', () => {
      // `MAX_LINE_LENGTH` should NOT render with <em>LINE</em> or similar.
      // Current behaviour: the underscore-italic regex matches `_LINE_`.
      // This test pins the current behaviour explicitly so a future tightening
      // of the regex doesn't silently regress the rendered output.
      const html = markdownToHtml('Set `MAX_LINE_LENGTH = 80`');
      expect(html).toContain('<code>MAX_LINE_LENGTH = 80</code>');
    });

    it('escapes < and > inside agent text so HTML never leaks', () => {
      // Important security invariant: untrusted CLI text -> chat -> innerHTML.
      const html = markdownToHtml('I will use the <Read> tool.');
      expect(html).not.toContain('<Read>');
      expect(html).toContain('&lt;Read&gt;');
    });

    it('handles a heading immediately followed by a code fence', () => {
      const md = '## Snippet\n```\nconst a = 1;\n```';
      const html = markdownToHtml(md);
      expect(html).toContain('<h2>Snippet</h2>');
      expect(html).toContain('<pre><code>const a = 1;</code></pre>');
    });

    it('renders a list followed by a paragraph without leaking the list tag', () => {
      const md = '- item one\n- item two\n\nFollow-up paragraph.';
      const html = markdownToHtml(md);
      expect(html).toMatch(/<ul><li>item one<\/li><li>item two<\/li><\/ul>\s*<p>Follow-up paragraph\.<\/p>/);
    });

    it('handles a code block followed by another paragraph (closing fence boundary)', () => {
      const md = ['```', 'a = 1', '```', '', 'After block.'].join('\n');
      const html = markdownToHtml(md);
      expect(html).toBe('<pre><code>a = 1</code></pre><p>After block.</p>');
    });

    it('joins multi-line paragraphs into one <p> with single space separators', () => {
      const md = 'First half\nsecond half\nthird piece.';
      const html = markdownToHtml(md);
      expect(html).toBe('<p>First half\nsecond half\nthird piece.</p>');
    });

    it('does not render an empty fenced block as a div with phantom content', () => {
      const md = '```\n```';
      const html = markdownToHtml(md);
      expect(html).toBe('<pre><code></code></pre>');
    });
  });

  describe('codeLineNumbers option', () => {
    it('keeps short code blocks unnumbered even with the option on', () => {
      const md = ['```', 'a = 1', 'b = 2', '```'].join('\n');
      const html = markdownToHtml(md, { codeLineNumbers: true });
      expect(html).toBe('<pre><code>a = 1\nb = 2</code></pre>');
    });

    it('numbers code blocks above the default 5-line threshold', () => {
      const lines = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'];
      const md = ['```', ...lines, '```'].join('\n');
      const html = markdownToHtml(md, { codeLineNumbers: true });
      expect(html).toContain('class="md-code md-code--numbered"');
      expect(html).toContain('data-line-count="6"');
      expect(html).toContain('<span class="md-code-num" aria-hidden="true">1</span>');
      expect(html).toContain('<span class="md-code-num" aria-hidden="true">6</span>');
      expect(html).toContain('<span class="md-code-text">l6</span>');
    });

    it('escapes < and > inside numbered code text', () => {
      const lines = ['<a>', '<b>', '<c>', '<d>', '<e>', '<f>'];
      const md = ['```', ...lines, '```'].join('\n');
      const html = markdownToHtml(md, { codeLineNumbers: true });
      expect(html).toContain('<span class="md-code-text">&lt;f&gt;</span>');
      expect(html).not.toContain('<span class="md-code-text"><f></span>');
    });

    it('respects a custom threshold', () => {
      const md = ['```', 'a', 'b', '```'].join('\n');
      const html = markdownToHtml(md, { codeLineNumbers: true, codeLineNumberThreshold: 1 });
      expect(html).toContain('class="md-code md-code--numbered"');
      expect(html).toContain('data-line-count="2"');
    });

    it('default-off keeps the historical <pre><code> shape verbatim', () => {
      // Critical: the editor relies on this shape for HTML <-> markdown
      // round-tripping. Pin so the option default never silently flips.
      const lines = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'];
      const md = ['```', ...lines, '```'].join('\n');
      expect(markdownToHtml(md)).toBe(`<pre><code>${lines.join('\n')}</code></pre>`);
    });
  });

  describe('language hint capture', () => {
    it('captures the fence language tag and syntax-highlights the body', () => {
      const md = ['```ts', 'const x: number = 1;', '```'].join('\n');
      const html = markdownToHtml(md);
      expect(html).toContain('data-lang="ts"');
      expect(html).toContain('md-code--lang-ts');
      // Highlighted: the block is flagged and carries class-based hljs tokens
      // (which survive the sanitizer, unlike inline styles). The source text
      // is now split across token spans, so it is no longer contiguous.
      expect(html).toContain('md-code--hl');
      expect(html).toContain('hljs-keyword');
      expect(html).toContain('>const<');
    });

    it('normalises common aliases (typescript -> ts, shell -> bash)', () => {
      const tsHtml = markdownToHtml(['```typescript', 'x', '```'].join('\n'));
      expect(tsHtml).toContain('md-code--lang-ts');
      expect(tsHtml).toContain('data-lang="typescript"');
      const bashHtml = markdownToHtml(['```shell', 'ls -la', '```'].join('\n'));
      expect(bashHtml).toContain('md-code--lang-bash');
    });

    it('falls back to the historical shape when no language is given', () => {
      // Untagged fences are still plain `<pre><code>` so existing
      // round-tripping consumers (the rich-text editor, prompt history)
      // are not disturbed by the new lang capture path.
      const html = markdownToHtml(['```', 'plain', '```'].join('\n'));
      expect(html).toBe('<pre><code>plain</code></pre>');
    });

    it('combines language hint with numbered shape when both are active', () => {
      const md = ['```ts', 'a', 'b', 'c', 'd', 'e', 'f', '```'].join('\n');
      const html = markdownToHtml(md, { codeLineNumbers: true, codeLineNumberThreshold: 3 });
      expect(html).toContain('md-code--numbered');
      expect(html).toContain('md-code--lang-ts');
      expect(html).toContain('data-lang="ts"');
    });

    it('highlights per line inside the numbered shape, one row per source line', () => {
      const md = ['```ts', 'const a = 1;', 'const b = 2;', 'const c = 3;', 'const d = 4;', '```'].join('\n');
      const html = markdownToHtml(md, { codeLineNumbers: true, codeLineNumberThreshold: 2 });
      expect(html).toContain('md-code--numbered');
      expect(html).toContain('md-code--hl');
      // One row per source line, with highlight tokens inside — the gutter grid
      // survives (balanced spans per line).
      expect((html.match(/class="md-code-row"/g) ?? []).length).toBe(4);
      expect(html).toContain('hljs-keyword');
    });

    it('re-opens a token span across line boundaries (multi-line comment)', () => {
      const md = ['```ts', '/* line one', '   line two', '   end */', 'const x = 1;', '```'].join('\n');
      const html = markdownToHtml(md, { codeLineNumbers: true, codeLineNumberThreshold: 2 });
      // Four source lines → four rows; the 3-line comment re-opens its span
      // per line (≥3 hljs-comment spans), and every span stays balanced.
      expect((html.match(/class="md-code-row"/g) ?? []).length).toBe(4);
      expect((html.match(/hljs-comment/g) ?? []).length).toBeGreaterThanOrEqual(3);
      const opens = (html.match(/<span/g) ?? []).length;
      const closes = (html.match(/<\/span>/g) ?? []).length;
      expect(opens).toBe(closes);
    });

    it('leaves an unknown fence language un-highlighted but still tagged', () => {
      const html = markdownToHtml(['```wat', 'noop', '```'].join('\n'));
      expect(html).toContain('data-lang="wat"');
      expect(html).not.toContain('md-code--hl');
      expect(html).not.toContain('hljs-');
      expect(html).toContain('<code>noop</code>');
    });
  });

  describe('task references', () => {
    const refs = [
      { label: 'ASS-738', taskKey: 'agent-taskboard::ass-738' },
      { label: 'feature-clickable-task-references-open-task-tab', taskKey: 'agent-taskboard::feature-clickable-task-references-open-task-tab' },
    ];

    it('links only known task references in rendered prose', () => {
      const html = markdownToHtml('See ASS-738 and ASS-999.', { taskReferences: refs });
      expect(html).toContain('data-task-ref="true"');
      expect(html).toContain('data-task-key="agent-taskboard::ass-738"');
      expect(html).toContain('href="#task:agent-taskboard%3A%3Aass-738"');
      expect(html).toContain('ASS-999');
      expect(html).not.toContain('agent-taskboard::ass-999');
    });

    it('does not link task references inside code or existing links', () => {
      const html = markdownToHtml('`ASS-738` and [ASS-738](https://example.com)', { taskReferences: refs });
      expect(html).toContain('<code>ASS-738</code>');
      expect(html).toContain('<a href="https://example.com"');
      expect(html).not.toContain('data-task-ref="true"');
    });

    it('links known slug labels in pre-rendered html', () => {
      const html = linkTaskReferencesInHtml(
        '<p>Open feature-clickable-task-references-open-task-tab.</p>',
        refs,
      );
      expect(html).toContain('data-task-ref="true"');
      expect(html).toContain('data-task-key="agent-taskboard::feature-clickable-task-references-open-task-tab"');
    });

    it('leaves duplicate labels unlinked so ambiguous references do not open the wrong task', () => {
      const html = markdownToHtml('See ASS-738.', {
        taskReferences: [
          { label: 'ASS-738', taskKey: 'agent-taskboard::first' },
          { label: 'ASS-738', taskKey: 'agent-taskboard::second' },
        ],
      });

      expect(html).toBe('<p>See ASS-738.</p>');
    });

    it('does not link task references embedded in longer words or slugs', () => {
      const html = markdownToHtml('See XASS-738, ASS-738-extra, and ASS-738.', { taskReferences: refs });

      expect(html).toContain('XASS-738');
      expect(html).toContain('ASS-738-extra');
      expect(html).toContain('data-task-key="agent-taskboard::ass-738"');
      expect(html.match(/data-task-ref="true"/g)?.length).toBe(1);
    });

    it('matches labels case-insensitively but keeps the original casing in the link text', () => {
      const html = linkTaskReferencesInHtml('<p>see ass-738 now</p>', refs);

      expect(html).toContain('data-task-key="agent-taskboard::ass-738"');
      expect(html).toContain('>ass-738</a>');
    });

    it('links every occurrence of a label within one text node', () => {
      const html = linkTaskReferencesInHtml('<p>ASS-738 first, then ASS-738 again.</p>', refs);

      expect(html.match(/data-task-ref="true"/g)?.length).toBe(2);
    });

    it('returns the input unchanged for empty or blank-only reference lists', () => {
      const input = '<p>See ASS-738.</p>';

      expect(linkTaskReferencesInHtml(input, [])).toBe(input);
      expect(linkTaskReferencesInHtml(input, null)).toBe(input);
      expect(
        linkTaskReferencesInHtml(input, [{ label: '   ', taskKey: 'agent-taskboard::blank' }]),
      ).toBe(input);
    });
  });
});

describe('htmlToMarkdown', () => {
  it('converts headings and paragraphs back to markdown blocks', () => {
    expect(htmlToMarkdown('<h1>Title</h1><p>Body text</p><h2>Sub</h2>')).toBe(
      '# Title\n\nBody text\n\n## Sub'
    );
  });

  it('converts emphasis, inline code and links back to inline markdown', () => {
    expect(
      htmlToMarkdown('<p>Some <strong>bold</strong>, <em>soft</em>, <code>x</code> and <a href="https://example.com">docs</a></p>')
    ).toBe('Some **bold**, _soft_, `x` and [docs](https://example.com)');
  });

  it('drops the link syntax for anchors without an href', () => {
    expect(htmlToMarkdown('<p><a>plain label</a></p>')).toBe('plain label');
  });

  it('converts unordered and ordered lists', () => {
    expect(htmlToMarkdown('<ul><li>one</li><li>two</li></ul>')).toBe('- one\n- two');
    expect(htmlToMarkdown('<ol><li>first</li><li>second</li></ol>')).toBe('1. first\n2. second');
  });

  it('converts <pre><code> blocks to fenced code and <br> to a newline', () => {
    expect(htmlToMarkdown('<pre><code>const a = 1;\nconst b = 2;</code></pre>')).toBe(
      '```\nconst a = 1;\nconst b = 2;\n```'
    );
    expect(htmlToMarkdown('<p>line one<br>line two</p>')).toBe('line one\nline two');
  });

  it('collapses image srcs through serializeImageSrc when serialising', () => {
    const markdown = htmlToMarkdown('<img src="/api/tasks/x/attachments/abc.png" alt="shot">', {
      serializeImageSrc: (src) => src.replace('/api/tasks/x/', ''),
    });
    expect(markdown).toBe('![shot](attachments/abc.png)');
  });

  it('round-trips markdownToHtml output byte-stable (rich-editor invariant)', () => {
    const md = '# Title\n\nSome **bold** and `code`\n\n- one\n- two\n\n```\na = 1\n```';
    expect(htmlToMarkdown(markdownToHtml(md))).toBe(md);
  });
});
