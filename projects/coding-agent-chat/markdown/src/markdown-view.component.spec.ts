import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import {
  CHAT_TASK_REFERENCE_PROVIDER,
  type ChatTaskReferenceProvider,
} from './chat-task-reference.token';
import {
  INLINE_REFERENCE_RENDERERS,
  type InlineReferenceMatcher,
} from './inline-reference.token';
import type { InlineReferenceMatch, MarkdownTaskReference } from './markdown-utils';
import { MarkdownViewComponent } from './markdown-view.component';

/** A minimal host slot component: renders the matched token in a marked chip. */
@Component({
  selector: 'test-inline-chip',
  standalone: true,
  template: `<mark data-slot [attr.data-kind]="'chip'">{{ token() }}</mark>`,
})
class InlineChipComponent {
  readonly token = input<string>('');
  readonly match = input<InlineReferenceMatch | null>(null);
}

/** A second, visually distinct slot so precedence is observable in the DOM. */
@Component({
  selector: 'test-inline-badge',
  standalone: true,
  template: `<b data-slot data-kind="badge">{{ token() }}</b>`,
})
class InlineBadgeComponent {
  readonly token = input<string>('');
}

/**
 * Covers the <cac-markdown> render surface: GFM rendering + sanitisation for
 * both input paths ([source] markdown, pre-rendered [html]) and the
 * CHAT_TASK_REFERENCE_PROVIDER seam (auto-linking + click navigation).
 */
describe('MarkdownViewComponent', () => {
  function taskRefProvider(
    references: readonly MarkdownTaskReference[],
  ): { provider: ChatTaskReferenceProvider; openTaskKey: ReturnType<typeof vi.fn> } {
    const openTaskKey = vi.fn().mockReturnValue(true);
    const provider: ChatTaskReferenceProvider = {
      markdownReferences: signal<readonly MarkdownTaskReference[]>(references),
      openTaskKey,
    };
    return { provider, openTaskKey };
  }

  it('renders GFM markdown from [source] (heading, list, fenced code)', async () => {
    const fixture = TestBed.createComponent(MarkdownViewComponent);
    fixture.componentRef.setInput(
      'source',
      '# Status\n\n- **Done**\n- `jobId`\n\n```\nconst a = 1;\n```',
    );
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('h1')?.textContent).toBe('Status');
    const items = el.querySelectorAll('ul li');
    expect(items.length).toBe(2);
    expect(items[0]?.querySelector('strong')?.textContent).toBe('Done');
    expect(items[1]?.querySelector('code')?.textContent).toBe('jobId');
    expect(el.querySelector('pre code')?.textContent).toBe('const a = 1;');
  });

  it('never lets a <script> from markdown [source] reach the DOM', async () => {
    const fixture = TestBed.createComponent(MarkdownViewComponent);
    fixture.componentRef.setInput('source', 'Hello <script>alert(1)</script>');
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('script')).toBeNull();
    // The tag survives as visible text, not as an executable element.
    expect(el.textContent).toContain('<script>alert(1)</script>');
  });

  it('prefers sanitised pre-rendered [html] over [source] when both are set', async () => {
    const fixture = TestBed.createComponent(MarkdownViewComponent);
    fixture.componentRef.setInput('html', '<p>from server</p><script>alert(1)</script>');
    fixture.componentRef.setInput('source', '# from markdown');
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('p')?.textContent).toBe('from server');
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('h1')).toBeNull();
  });

  it('re-renders when [source] changes', async () => {
    const fixture = TestBed.createComponent(MarkdownViewComponent);
    fixture.componentRef.setInput('source', '# One');
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('h1')?.textContent).toBe('One');

    fixture.componentRef.setInput('source', '## Two');
    await fixture.whenStable();
    expect(el.querySelector('h1')).toBeNull();
    expect(el.querySelector('h2')?.textContent).toBe('Two');
  });

  it('leaves task keys unlinked with the default no-op provider', async () => {
    const fixture = TestBed.createComponent(MarkdownViewComponent);
    fixture.componentRef.setInput('source', 'See ASS-738 for details.');
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('a[data-task-ref]')).toBeNull();
    expect(el.textContent).toContain('ASS-738');
  });

  it('links known task keys via an overridden provider and routes clicks to openTaskKey', async () => {
    const { provider, openTaskKey } = taskRefProvider([
      { label: 'ASS-738', taskKey: 'board::ass-738' },
    ]);
    TestBed.configureTestingModule({
      providers: [{ provide: CHAT_TASK_REFERENCE_PROVIDER, useValue: provider }],
    });

    const fixture = TestBed.createComponent(MarkdownViewComponent);
    fixture.componentRef.setInput('source', 'Please look at ASS-738 today.');
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    const anchor = el.querySelector<HTMLAnchorElement>('a[data-task-ref="true"]');
    expect(anchor).not.toBeNull();
    expect(anchor!.dataset['taskKey']).toBe('board::ass-738');
    expect(anchor!.textContent).toBe('ASS-738');

    // Clicking ordinary prose does not navigate.
    el.querySelector('p')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(openTaskKey).not.toHaveBeenCalled();

    anchor!.click();
    expect(openTaskKey).toHaveBeenCalledTimes(1);
    expect(openTaskKey).toHaveBeenCalledWith('board::ass-738');
  });

  it('auto-links task keys in the pre-rendered [html] path too', async () => {
    const { provider } = taskRefProvider([
      { label: 'ASS-738', taskKey: 'board::ass-738' },
    ]);
    TestBed.configureTestingModule({
      providers: [{ provide: CHAT_TASK_REFERENCE_PROVIDER, useValue: provider }],
    });

    const fixture = TestBed.createComponent(MarkdownViewComponent);
    fixture.componentRef.setInput('html', '<p>Server says ASS-738.</p>');
    await fixture.whenStable();

    const anchor = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLAnchorElement>('a[data-task-ref="true"]');
    expect(anchor).not.toBeNull();
    expect(anchor!.dataset['taskKey']).toBe('board::ass-738');
  });

  // ── Generic inline-reference extension point ────────────────────────────
  describe('INLINE_REFERENCE_RENDERERS', () => {
    function withRenderers(renderers: readonly InlineReferenceMatcher[]): void {
      TestBed.configureTestingModule({
        providers: [{ provide: INLINE_REFERENCE_RENDERERS, useValue: renderers }],
      });
    }

    it('slots the host component in place of a matched token, fed the token', async () => {
      withRenderers([
        { id: 'task', pattern: /\b[A-Z]{2,}-\d+\b/g, component: InlineChipComponent },
      ]);

      const fixture = TestBed.createComponent(MarkdownViewComponent);
      fixture.componentRef.setInput('source', 'Please look at AGT-1234 today.');
      fixture.detectChanges();
      await fixture.whenStable();

      const el: HTMLElement = fixture.nativeElement;
      const slot = el.querySelector<HTMLElement>('test-inline-chip mark[data-slot]');
      expect(slot).not.toBeNull();
      expect(slot!.textContent).toBe('AGT-1234');
      // The inert placeholder marker is gone once hydrated…
      expect(el.querySelector('[data-cac-ref]')).toBeNull();
      // …and the surrounding prose is intact.
      expect(el.querySelector('p')?.textContent).toContain('Please look at');
      expect(el.querySelector('p')?.textContent).toContain('today.');
    });

    it('passes the full match (token + named groups) to the slot', async () => {
      const seen: InlineReferenceMatch[] = [];
      withRenderers([
        {
          id: 'task',
          pattern: /\b(?<board>[A-Z]{2,})-(?<num>\d+)\b/g,
          component: InlineChipComponent,
          inputs: (match) => {
            seen.push(match);
            return { token: match.token, match };
          },
        },
      ]);

      const fixture = TestBed.createComponent(MarkdownViewComponent);
      fixture.componentRef.setInput('source', 'ticket CAR-2 here');
      fixture.detectChanges();
      await fixture.whenStable();

      expect(seen).toHaveLength(1);
      expect(seen[0]).toEqual({
        matcherId: 'task',
        token: 'CAR-2',
        groups: { board: 'CAR', num: '2' },
      });
    });

    it('leaves matches inside a code fence plain (no slot)', async () => {
      withRenderers([
        { id: 'task', pattern: /\b[A-Z]{2,}-\d+\b/g, component: InlineChipComponent },
      ]);

      const fixture = TestBed.createComponent(MarkdownViewComponent);
      fixture.componentRef.setInput('source', '```\ndeploy AGT-1234\n```');
      fixture.detectChanges();
      await fixture.whenStable();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('test-inline-chip')).toBeNull();
      expect(el.querySelector('pre code')?.textContent).toContain('AGT-1234');
    });

    it('renders plain text when no renderer is registered (default)', async () => {
      const fixture = TestBed.createComponent(MarkdownViewComponent);
      fixture.componentRef.setInput('source', 'Please look at AGT-1234 today.');
      fixture.detectChanges();
      await fixture.whenStable();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('[data-cac-ref]')).toBeNull();
      expect(el.querySelector('test-inline-chip')).toBeNull();
      expect(el.querySelector('p')?.textContent).toBe('Please look at AGT-1234 today.');
    });

    it('honours matcher precedence — the earlier matcher wins an overlapping span', async () => {
      withRenderers([
        { id: 'chip', pattern: /\bAGT-\d+\b/g, component: InlineChipComponent },
        { id: 'badge', pattern: /\b[A-Z]+-\d+\b/g, component: InlineBadgeComponent },
      ]);

      const fixture = TestBed.createComponent(MarkdownViewComponent);
      fixture.componentRef.setInput('source', 'see AGT-1234');
      fixture.detectChanges();
      await fixture.whenStable();

      const el: HTMLElement = fixture.nativeElement;
      // The higher-precedence (first-registered) chip claims AGT-1234.
      expect(el.querySelector('test-inline-chip mark[data-slot]')?.textContent).toBe('AGT-1234');
      expect(el.querySelector('test-inline-badge')).toBeNull();
    });

    it('re-hydrates slots when [source] changes and cleans up the old ones', async () => {
      withRenderers([
        { id: 'task', pattern: /\b[A-Z]{2,}-\d+\b/g, component: InlineChipComponent },
      ]);

      const fixture = TestBed.createComponent(MarkdownViewComponent);
      fixture.componentRef.setInput('source', 'first AGT-1');
      fixture.detectChanges();
      await fixture.whenStable();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelectorAll('test-inline-chip')).toHaveLength(1);
      expect(el.querySelector('test-inline-chip mark')?.textContent).toBe('AGT-1');

      fixture.componentRef.setInput('source', 'second CAR-2 and CAR-3');
      fixture.detectChanges();
      await fixture.whenStable();
      const chips = el.querySelectorAll('test-inline-chip mark');
      expect(Array.from(chips).map((c) => c.textContent)).toEqual(['CAR-2', 'CAR-3']);
    });
  });
});
