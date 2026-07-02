import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import {
  CHAT_TASK_REFERENCE_PROVIDER,
  type ChatTaskReferenceProvider,
} from './chat-task-reference.token';
import type { MarkdownTaskReference } from './markdown-utils';
import { MarkdownViewComponent } from './markdown-view.component';

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
});
