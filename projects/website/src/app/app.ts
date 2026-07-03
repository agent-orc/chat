import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { ChatSubmitEvent, ConversationEvent } from '@coding-agent/chat/core';
import { ChatComponent } from '@coding-agent/chat/composer';
import { ConversationViewComponent } from '@coding-agent/chat/conversation';
import { ProjectChatListComponent } from '@coding-agent/chat/history';

import { CodeBlockComponent } from './code-block.component';
import { DEMO_REPLAY_STEPS, userTurnEvent } from './demo-fixtures';
import {
  SNIPPET_CORE_ONLY,
  SNIPPET_DATA_SOURCE,
  SNIPPET_INSTALL,
  SNIPPET_PROVIDE,
  SNIPPET_RENDER,
  SNIPPET_SEAM_HISTORY,
  SNIPPET_SEAM_PROVIDE,
  SNIPPET_THEME,
} from './snippets';

/** Section ids the sticky nav highlights while scrolling. */
const NAV_SECTIONS = ['demo', 'history', 'features', 'docs'] as const;

@Component({
  selector: 'app-root',
  imports: [ConversationViewComponent, ChatComponent, ProjectChatListComponent, CodeBlockComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly destroyRef = inject(DestroyRef);

  // --- Docs snippets --------------------------------------------------------
  protected readonly snippetInstall = SNIPPET_INSTALL;
  protected readonly snippetProvide = SNIPPET_PROVIDE;
  protected readonly snippetRender = SNIPPET_RENDER;
  protected readonly snippetSeamProvide = SNIPPET_SEAM_PROVIDE;
  protected readonly snippetSeamHistory = SNIPPET_SEAM_HISTORY;
  protected readonly snippetDataSource = SNIPPET_DATA_SOURCE;
  protected readonly snippetTheme = SNIPPET_THEME;
  protected readonly snippetCoreOnly = SNIPPET_CORE_ONLY;
  protected readonly heroInstall = 'npm install @coding-agent/chat';

  // --- Live demo: replayed conversation --------------------------------------
  /** How many fixture steps are currently on screen. */
  private readonly playedCount = signal(0);
  /** Extra user turns appended locally by the composer. */
  private readonly localTurns = signal<readonly ConversationEvent[]>([]);
  /** Invalidates pending timers when a replay restarts. */
  private replayToken = 0;

  protected readonly playing = signal(false);
  protected readonly hasPlayed = signal(false);
  protected readonly demoTheme = signal<'dark' | 'light'>('dark');
  protected readonly totalSteps = DEMO_REPLAY_STEPS.length;

  protected readonly shownSteps = computed(() => this.playedCount());
  protected readonly demoEvents = computed<readonly ConversationEvent[]>(() => [
    ...DEMO_REPLAY_STEPS.slice(0, this.playedCount()).map((step) => step.event),
    ...this.localTurns(),
  ]);

  // --- Sticky nav highlight ---------------------------------------------------
  protected readonly activeSection = signal<string>('');

  constructor() {
    afterNextRender(() => {
      this.observeSections();
      this.observeReveals();
      this.autoplayWhenDemoVisible();
    });
    this.destroyRef.onDestroy(() => {
      this.replayToken += 1; // cancel any scheduled replay step
    });
  }

  protected play(): void {
    this.replayToken += 1;
    const token = this.replayToken;
    this.localTurns.set([]);
    this.playedCount.set(0);
    this.playing.set(true);
    this.hasPlayed.set(true);
    this.scheduleStep(0, token);
  }

  protected toggleDemoTheme(): void {
    this.demoTheme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  protected onComposerSubmit(submit: ChatSubmitEvent): void {
    const text = submit.text.trim();
    if (text.length === 0) return;
    // If the visitor types before pressing play, show the full transcript first.
    if (this.playedCount() === 0) {
      this.playedCount.set(this.totalSteps);
      this.hasPlayed.set(true);
    }
    this.localTurns.update((list) => [...list, userTurnEvent(text)]);
  }

  private scheduleStep(index: number, token: number): void {
    if (token !== this.replayToken) return;
    if (index >= DEMO_REPLAY_STEPS.length) {
      this.playing.set(false);
      return;
    }
    this.playedCount.set(index + 1);
    const hold = DEMO_REPLAY_STEPS[index].holdMs;
    setTimeout(() => this.scheduleStep(index + 1, token), hold);
  }

  // --- Intersection observers ---------------------------------------------------

  private observeSections(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) this.activeSection.set(entry.target.id);
        }
      },
      // A slim horizontal band ~1/3 down the viewport decides the active link.
      { rootMargin: '-30% 0px -60% 0px' },
    );
    for (const id of NAV_SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private observeReveals(): void {
    const targets = Array.from(document.querySelectorAll('.reveal'));
    if (typeof IntersectionObserver === 'undefined') {
      for (const el of targets) el.classList.add('is-visible');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    for (const el of targets) observer.observe(el);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private autoplayWhenDemoVisible(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.play();
      return;
    }
    const demo = document.getElementById('demo');
    if (!demo) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !this.hasPlayed()) {
          observer.disconnect();
          this.play();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(demo);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
