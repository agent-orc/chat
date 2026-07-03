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
import {
  DEMO_REPLAY_STEPS,
  DEMO_REPLAY_STEPS_B,
  type ReplayStep,
  demoAgentResponseSteps,
  userTurnEvent,
} from './demo-fixtures';
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

/**
 * What the agent is "doing" during the pause before the next event lands.
 * Long-running work must be legible: a tool burst reads as tool time, text
 * reads as thinking, markers/metrics as the run wrapping up.
 */
function workingLabel(kind: ConversationEvent['kind'] | null): string {
  switch (kind) {
    case 'toolBurst':
      return 'running tools…';
    case 'runMarker':
    case 'metric.token':
      return 'wrapping up…';
    case 'decision.orchestrator':
      return 'reviewing…';
    case 'supervisor.wait':
      return 'waiting (watchdog)…';
    default:
      return 'thinking…';
  }
}

/**
 * One paced fixture replay: streams `ReplayStep`s onto the page with their
 * authored holds and exposes the signals the frame chrome needs to show
 * that work is happening (working label, last-contact timestamp).
 */
class DemoReplay {
  /** How many fixture steps are currently on screen. */
  readonly played = signal(0);
  readonly playing = signal(false);
  readonly hasPlayed = signal(false);
  /** Epoch ms of the most recent event — feeds the "last contact" readout. */
  readonly lastEventAt = signal(0);
  /** Invalidates pending timers when a replay restarts or unmounts. */
  private token = 0;

  readonly total: number;
  readonly events = computed<readonly ConversationEvent[]>(() =>
    this.steps.slice(0, this.played()).map((step) => step.event),
  );
  /** Kind of the event currently being "worked on" (the next one to land). */
  readonly nextKind = computed<ConversationEvent['kind'] | null>(() =>
    this.playing() ? (this.steps[this.played()]?.event.kind ?? null) : null,
  );

  constructor(private readonly steps: readonly ReplayStep[]) {
    this.total = steps.length;
  }

  play(): void {
    this.token += 1;
    const token = this.token;
    this.played.set(0);
    this.playing.set(true);
    this.hasPlayed.set(true);
    this.lastEventAt.set(Date.now());
    this.step(0, token);
  }

  cancel(): void {
    this.token += 1;
  }

  private step(index: number, token: number): void {
    if (token !== this.token) return;
    if (index >= this.steps.length) {
      this.playing.set(false);
      return;
    }
    this.played.set(index + 1);
    this.lastEventAt.set(Date.now());
    setTimeout(() => this.step(index + 1, token), this.steps[index].holdMs);
  }
}

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

  // --- Live demo: two paced replays -----------------------------------------
  protected readonly replayA = new DemoReplay(DEMO_REPLAY_STEPS);
  protected readonly replayB = new DemoReplay(DEMO_REPLAY_STEPS_B);
  protected readonly demoTheme = signal<'dark' | 'light'>('dark');

  /** 1s wall-clock tick for the "last contact Ns ago" readouts. */
  private readonly now = signal(Date.now());

  protected readonly workingA = computed(() => workingLabel(this.replayA.nextKind()));
  protected readonly workingB = computed(() => workingLabel(this.replayB.nextKind()));
  protected readonly contactA = computed(() => this.secondsSince(this.replayA.lastEventAt()));
  protected readonly contactB = computed(() => this.secondsSince(this.replayB.lastEventAt()));

  // --- Composer demo: scripted Demo Agent replies ------------------------------
  /** The composer frame's own mini conversation (user turns + scripted replies). */
  protected readonly composerEvents = signal<readonly ConversationEvent[]>([]);
  /** True while a scripted reply is still streaming in. */
  protected readonly composerBusy = signal(false);
  /** Kind of the scripted event currently being "worked on". */
  private readonly composerNextKind = signal<ConversationEvent['kind'] | null>(null);
  /** Epoch ms of the last composer-frame event (user turn or reply step). */
  private readonly composerLastAt = signal(0);
  protected readonly workingComposer = computed(() => workingLabel(this.composerNextKind()));
  protected readonly contactComposer = computed(() => this.secondsSince(this.composerLastAt()));
  /** Submits waiting for their scripted reply, processed strictly in order. */
  private readonly pendingReplies: string[] = [];
  /** Guards composer timers on teardown. */
  private composerAlive = true;

  // --- Sticky nav highlight ---------------------------------------------------
  protected readonly activeSection = signal<string>('');

  constructor() {
    afterNextRender(() => {
      this.observeSections();
      this.observeReveals();
      this.autoplayWhenVisible();
      this.startContactTicker();
    });
    this.destroyRef.onDestroy(() => {
      this.replayA.cancel(); // cancel any scheduled replay step
      this.replayB.cancel();
      this.composerAlive = false; // cancel any scheduled scripted reply
    });
  }

  protected toggleDemoTheme(): void {
    this.demoTheme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  private secondsSince(epochMs: number): number {
    return Math.max(0, Math.floor((this.now() - epochMs) / 1000));
  }

  private startContactTicker(): void {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected onComposerSubmit(submit: ChatSubmitEvent): void {
    const text = submit.text.trim();
    if (text.length === 0) return;
    // The user turn lands immediately; the scripted reply queues behind any
    // reply that is still streaming so multiple submits play out in order.
    this.composerEvents.update((list) => [...list, userTurnEvent(text)]);
    this.composerLastAt.set(Date.now());
    this.pendingReplies.push(text);
    if (!this.composerBusy()) this.streamNextReply();
  }

  /** Pop the next queued submit and stream its scripted reply step by step. */
  private streamNextReply(): void {
    const text = this.pendingReplies.shift();
    if (text === undefined) {
      this.composerBusy.set(false);
      this.composerNextKind.set(null);
      return;
    }
    this.composerBusy.set(true);
    const steps = demoAgentResponseSteps(text);
    this.composerNextKind.set(steps[0]?.event.kind ?? null);
    let elapsed = 0;
    for (const [i, step] of steps.entries()) {
      elapsed += step.delayMs;
      const isLast = i === steps.length - 1;
      const upNext = steps[i + 1]?.event.kind ?? null;
      setTimeout(() => {
        if (!this.composerAlive) return;
        this.composerEvents.update((list) => [...list, step.event]);
        this.composerLastAt.set(Date.now());
        this.composerNextKind.set(upNext);
        if (isLast) this.streamNextReply();
      }, elapsed);
    }
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

  /** Each replay frame starts on its own first scroll into view. */
  private autoplayWhenVisible(): void {
    const frames: ReadonlyArray<[string, DemoReplay]> = [
      ['demo-frame-a', this.replayA],
      ['demo-frame-b', this.replayB],
    ];
    if (typeof IntersectionObserver === 'undefined') {
      for (const [, replay] of frames) replay.play();
      return;
    }
    for (const [id, replay] of frames) {
      const el = document.getElementById(id);
      if (!el) continue;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting) && !replay.hasPlayed()) {
            observer.disconnect();
            replay.play();
          }
        },
        { threshold: 0.25 },
      );
      observer.observe(el);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
  }
}
