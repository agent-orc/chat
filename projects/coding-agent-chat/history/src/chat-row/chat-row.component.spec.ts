/**
 * Specs for the shared chat row: markdown body rendering through
 * `<cac-markdown>`, the pre-rendered `bodyHtml` fast path, the
 * user/event/flash variants, and the role-badge vs "You" author header.
 */
import { TestBed } from '@angular/core/testing';

import { ChatRowComponent, type ChatRowInput } from './chat-row.component';

async function render(row: ChatRowInput) {
  const fixture = TestBed.createComponent(ChatRowComponent);
  fixture.componentRef.setInput('row', row);
  await fixture.whenStable();
  return fixture;
}

function baseRow(overrides: Partial<ChatRowInput> = {}): ChatRowInput {
  return {
    id: 'turn-1',
    author: 'orchestrator',
    kind: 'turn',
    ts: '2026-01-01T00:00:00.000Z',
    body: 'Hello **world**',
    ...overrides,
  };
}

describe('ChatRowComponent (markdown body)', () => {
  it('renders row bodies through the shared markdown view with GFM tables', async () => {
    const fixture = await render(
      baseRow({
        id: 'orchestrator-table',
        body:
          '| Field | Value |\n' +
          '| --- | --- |\n' +
          '| ID | ASS-704 |\n\n' +
          '- **Done**\n' +
          '- [Docs](https://example.com)\n\n' +
          '```ts\nconst ok = true;\n```',
      }),
    );

    const el: HTMLElement = fixture.nativeElement;
    const row = el.querySelector<HTMLElement>('[data-row-id="orchestrator-table"]');

    expect(row?.querySelector('cac-markdown')).toBeTruthy();
    expect(row?.querySelector('table')).toBeTruthy();
    const tableCells = [...(row?.querySelectorAll('td') ?? [])].map((cell) =>
      cell.textContent?.trim(),
    );
    expect(tableCells).toContain('ASS-704');
    expect(row?.querySelector('ul')).toBeTruthy();
    expect(row?.querySelector('strong')?.textContent).toBe('Done');
    expect(row?.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(row?.querySelector('pre code')?.textContent).toContain('const ok = true;');
  });

  it('prefers pre-rendered bodyHtml over the markdown path', async () => {
    const fixture = await render(
      baseRow({ body: 'ignored *markdown*', bodyHtml: '<em data-pre="1">already html</em>' }),
    );

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('cac-markdown')).toBeNull();
    expect(el.querySelector('.chat-row__body em[data-pre="1"]')?.textContent).toBe('already html');
  });
});

describe('ChatRowComponent (header + variants)', () => {
  it('shows the "You" author label instead of a role badge for user rows', async () => {
    const fixture = await render(
      baseRow({ author: 'user', userVariant: true, body: 'hi there' }),
    );

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.chat-row__author')?.textContent?.trim()).toBe('You');
    expect(el.querySelector('cac-role-badge')).toBeNull();
    expect(el.querySelector('.chat-row')?.classList.contains('chat-row--user')).toBe(true);
  });

  it('honours an explicit authorLabel override for user rows', async () => {
    const fixture = await render(baseRow({ author: 'user', authorLabel: 'Operator' }));
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.chat-row__author')?.textContent?.trim(),
    ).toBe('Operator');
  });

  it('renders a role badge + monospace kind chip for non-user authors', async () => {
    const fixture = await render(baseRow({ author: 'claude', kind: 'event-tool-call' }));

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('cac-role-badge .role-badge')).toBeTruthy();
    expect(el.querySelector('.chat-row__author')).toBeNull();
    expect(el.querySelector('.chat-row__kind')?.textContent?.trim()).toBe('event-tool-call');
  });

  it('applies the event and flash modifier classes', async () => {
    const fixture = await render(baseRow({ eventVariant: true, flash: true }));

    const article = (fixture.nativeElement as HTMLElement).querySelector('.chat-row')!;
    expect(article.classList.contains('chat-row--event')).toBe(true);
    expect(article.classList.contains('chat-row--flash')).toBe(true);
  });

  it('renders the timestamp into a <time> element with the ISO datetime attr', async () => {
    const fixture = await render(baseRow({ ts: '2026-02-03T04:05:06.000Z' }));

    const time = (fixture.nativeElement as HTMLElement).querySelector('time.chat-row__ts');
    expect(time?.getAttribute('datetime')).toBe('2026-02-03T04:05:06.000Z');
    expect(time?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders the shared compact model and thinking indicator when attributed', async () => {
    const fixture = await render(baseRow({ model: 'gpt-5-codex', thinkingLevel: 'high' }));
    const indicator = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="chat-row-model"]');
    expect(indicator?.textContent?.replace(/\s/g, '')).toBe('CDXH');
  });
});
