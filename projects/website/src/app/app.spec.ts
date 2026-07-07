import { DeferBlockState } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { App } from './app';
import { appConfig } from './app.config';

describe('App (website)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: appConfig.providers,
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('prerenders the hero, docs and skeleton placeholders for the demos', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('coding agents');
    expect(compiled.querySelector('#docs')).toBeTruthy();
    expect(compiled.querySelectorAll('site-code').length).toBeGreaterThan(5);
    // The interactive library demos sit in `@defer (on viewport)` blocks so
    // the prerendered page ships static skeletons instead of live components.
    // Three conversation skeletons: replay, bugfix transcript, rendering showcase.
    expect(compiled.querySelectorAll('.skeleton--conversation').length).toBe(3);
    expect(compiled.querySelector('.skeleton--composer')).toBeTruthy();
  });

  it('stacks the two demo conversations vertically plus a solo composer frame', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('.demo-stack > .demo-frame').length).toBe(2);
    expect(compiled.querySelector('.demo-frame--solo')).toBeTruthy();
    expect(compiled.querySelector('.demo-frame--render')).toBeTruthy();
    expect(compiled.querySelectorAll('.demo-chip').length).toBe(4);
  });

  it('renders both library demos once the defer blocks complete', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    for (const block of await fixture.getDeferBlocks()) {
      await block.render(DeferBlockState.Complete);
    }
    const compiled = fixture.nativeElement as HTMLElement;
    // Replay + bugfix transcript + rendering showcase render as conversation views.
    expect(compiled.querySelectorAll('cac-conversation-view').length).toBeGreaterThanOrEqual(3);
    expect(compiled.querySelector('cac-chat')).toBeTruthy();
    // The showcase transcript ships highlighted code and clickable images.
    expect(compiled.querySelector('.md-code--hl')).toBeTruthy();
    expect(compiled.querySelectorAll('img[src^="media/"]').length).toBeGreaterThanOrEqual(2);
  });

  it('streams a scripted Demo Agent reply after a composer submit', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    for (const block of await fixture.getDeferBlocks()) {
      await block.render(DeferBlockState.Complete);
    }
    // Fake timers only around the scripted reply — whenStable() above needs
    // the real scheduler.
    vi.useFakeTimers();
    try {
      const app = fixture.componentInstance as unknown as {
        onComposerSubmit(e: { text: string }): void;
        composerEvents(): readonly { kind: string; actor?: string; body?: string }[];
        composerBusy(): boolean;
      };
      app.onComposerSubmit({ text: 'Rename the export button' });
      // The user turn lands immediately; the reply streams behind timers.
      expect(app.composerEvents().length).toBe(1);
      expect(app.composerEvents()[0].kind).toBe('message.user');
      expect(app.composerBusy()).toBe(true);
      // Reply pacing is 1.8s + 1.6s + 2.8s = 6.2s of scripted "work".
      vi.advanceTimersByTime(7000);
      const events = app.composerEvents();
      expect(events.length).toBe(4); // user + plan + burst + answer
      expect(events.some((e) => e.kind === 'toolBurst')).toBe(true);
      const replies = events.filter((e) => e.actor === 'Demo Agent');
      expect(replies.length).toBe(2);
      expect(replies[0].body).toContain('Demo response');
      expect(replies[1].body).toContain('Rename the export button');
      expect(app.composerBusy()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('queues multiple submits and answers them strictly in order', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    vi.useFakeTimers();
    try {
      const app = fixture.componentInstance as unknown as {
        onComposerSubmit(e: { text: string }): void;
        composerEvents(): readonly { kind: string; actor?: string; body?: string }[];
        composerBusy(): boolean;
      };
      app.onComposerSubmit({ text: 'first ask' });
      app.onComposerSubmit({ text: 'second ask' });
      expect(app.composerEvents().filter((e) => e.kind === 'message.user').length).toBe(2);
      // Two queued replies at ~6.2s each stream strictly back to back.
      vi.advanceTimersByTime(15000);
      const answers = app
        .composerEvents()
        .filter((e) => e.actor === 'Demo Agent' && e.kind === 'message.taskAgent');
      // Two replies, two messages each (plan + answer), in submit order.
      expect(answers.length).toBe(4);
      expect(answers[1].body).toContain('first ask');
      expect(answers[3].body).toContain('second ask');
      expect(app.composerBusy()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
