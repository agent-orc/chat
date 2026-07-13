import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type {
  ChatContextUsage,
  ChatModelControl,
  ChatModelSelection,
  ChatPermissionControl,
  ChatSubmitEvent,
  ChatToolbarItem,
  ConversationEvent,
} from 'coding-agent-chat/core';
import { ChatComponent } from 'coding-agent-chat/composer';
import { ConversationViewComponent } from 'coding-agent-chat/conversation';
import { MarkdownViewComponent } from 'coding-agent-chat/markdown';
import { TooltipDirective } from 'coding-agent-chat/shared';

import { CodeBlockComponent } from './code-block.component';
import {
  ENTRY_POINT_TABS,
  EXPLORER_EVENTS,
  EXPLORER_EVENT_JSON,
  EXPLORER_MARKDOWN,
  EXPLORER_SNIPPETS,
  type EntryPointKey,
} from './explorer-data';
import { ThemeIconComponent } from './theme-icon.component';
import {
  DEMO_REPLAY_STEPS,
  DEMO_REPLAY_STEPS_B,
  type ReplayStep,
  demoAgentResponseSteps,
  userTurnEvent,
} from './demo-fixtures';
import { SHOWCASE_EVENTS } from './showcase-fixtures';
import { WebsiteLightboxService } from './website-lightbox.service';
import { WebsiteSeoService } from './website-seo.service';
import {
  SNIPPET_CORE_ONLY,
  SNIPPET_DATA_SOURCE,
  SNIPPET_INSTALL,
  SNIPPET_PROVIDE,
  SNIPPET_RENDER,
  SNIPPET_SEAM_HISTORY,
  SNIPPET_SEAM_PROVIDE,
  SNIPPET_THEME,
  SNIPPET_THEME_OVERRIDE,
  SNIPPET_THEME_SCOPE,
} from './snippets';

/** Section ids the sticky nav highlights while scrolling. */
const NAV_SECTIONS = ['demo', 'rendering', 'features', 'docs'] as const;

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
  /** Follow-up events appended by the frame's composer (user turns + scripted replies). */
  private readonly extras = signal<readonly ConversationEvent[]>([]);
  /** Invalidates pending timers when a replay restarts or unmounts. */
  private token = 0;

  readonly total: number;
  readonly events = computed<readonly ConversationEvent[]>(() => [
    ...this.steps.slice(0, this.played()).map((step) => step.event),
    ...this.extras(),
  ]);
  /** Kind of the event currently being "worked on" (the next one to land). */
  readonly nextKind = computed<ConversationEvent['kind'] | null>(() =>
    this.playing() ? (this.steps[this.played()]?.event.kind ?? null) : null,
  );

  constructor(private readonly steps: readonly ReplayStep[]) {
    this.total = steps.length;
  }

  /** Append a composer follow-up after the replayed transcript. */
  append(event: ConversationEvent): void {
    this.extras.update((list) => [...list, event]);
  }

  play(): void {
    this.token += 1;
    const token = this.token;
    this.played.set(0);
    this.extras.set([]); // a restart tells the story from the top
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

/**
 * One composer-fed reply loop: a submit appends the user turn immediately,
 * then streams the scripted Demo Agent reply (plan → tool burst → answer)
 * into `append` with the same 1.5–3s pacing as the replays. Queued submits
 * play strictly in order. One instance per demo surface.
 */
class ScriptedThread {
  readonly busy = signal(false);
  /** Kind of the scripted event currently being "worked on". */
  readonly nextKind = signal<ConversationEvent['kind'] | null>(null);
  /** Epoch ms of the last thread event (user turn or reply step). */
  readonly lastAt = signal(0);
  private readonly pending: string[] = [];
  private alive = true;

  constructor(private readonly append: (event: ConversationEvent) => void) {}

  destroy(): void {
    this.alive = false;
  }

  submit(text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    this.append(userTurnEvent(trimmed));
    this.lastAt.set(Date.now());
    this.pending.push(trimmed);
    if (!this.busy()) this.streamNext();
  }

  private streamNext(): void {
    const text = this.pending.shift();
    if (text === undefined) {
      this.busy.set(false);
      this.nextKind.set(null);
      return;
    }
    this.busy.set(true);
    const steps = demoAgentResponseSteps(text);
    this.nextKind.set(steps[0]?.event.kind ?? null);
    let elapsed = 0;
    for (const [i, step] of steps.entries()) {
      elapsed += step.delayMs;
      const isLast = i === steps.length - 1;
      const upNext = steps[i + 1]?.event.kind ?? null;
      setTimeout(() => {
        if (!this.alive) return;
        this.append(step.event);
        this.lastAt.set(Date.now());
        this.nextKind.set(upNext);
        if (isLast) this.streamNext();
      }, elapsed);
    }
  }
}

@Component({
  selector: 'app-root',
  imports: [
    ConversationViewComponent,
    ChatComponent,
    CodeBlockComponent,
    MarkdownViewComponent,
    ThemeIconComponent,
    TooltipDirective,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onLightboxKey($event)',
  },
})
export class App {
  private readonly destroyRef = inject(DestroyRef);
  private readonly websiteSeo = inject(WebsiteSeoService);

  protected readonly alternateLanguage = this.websiteSeo.alternateLanguage;
  protected readonly legalPrefix = this.websiteSeo.legalPrefix;

  // --- Docs snippets --------------------------------------------------------
  protected readonly snippetInstall = SNIPPET_INSTALL;
  protected readonly snippetProvide = SNIPPET_PROVIDE;
  protected readonly snippetRender = SNIPPET_RENDER;
  protected readonly snippetSeamProvide = SNIPPET_SEAM_PROVIDE;
  protected readonly snippetSeamHistory = SNIPPET_SEAM_HISTORY;
  protected readonly snippetDataSource = SNIPPET_DATA_SOURCE;
  protected readonly snippetTheme = SNIPPET_THEME;
  protected readonly snippetThemeScope = SNIPPET_THEME_SCOPE;
  protected readonly snippetThemeOverride = SNIPPET_THEME_OVERRIDE;
  protected readonly snippetCoreOnly = SNIPPET_CORE_ONLY;
  protected readonly heroInstall = 'npm install coding-agent-chat';

  // --- Live demo: two paced replays, each with a follow-up composer ----------
  protected readonly replayA = new DemoReplay(DEMO_REPLAY_STEPS);
  protected readonly replayB = new DemoReplay(DEMO_REPLAY_STEPS_B);
  protected readonly threadA = new ScriptedThread((e) => this.replayA.append(e));
  protected readonly threadB = new ScriptedThread((e) => this.replayB.append(e));
  /** Per-frame preview theme — thanks to the token scopes each frame is
   * independently light/dark, toggled by the icon in its own title bar. */
  protected readonly frameThemes = {
    a: signal<'dark' | 'light'>('dark'),
    b: signal<'dark' | 'light'>('dark'),
    render: signal<'dark' | 'light'>('dark'),
  };

  // --- Fully-loaded composer (frame A): model picker, permissions, context ---
  /** Interactive model/CLI/thinking picker — commits update the signal. */
  protected readonly demoModel = signal<ChatModelControl>({
    cliOptions: [
      { id: 'claude', label: 'Claude Code', icon: '✳' },
      { id: 'codex', label: 'Codex CLI', icon: '▸' },
    ],
    cliType: 'claude',
    model: 'claude-fable-5',
    thinkingLevel: 'high',
    catalog: [
      {
        id: 'claude-fable-5',
        label: 'fable 5',
        isDefault: true,
        thinkingLevels: ['low', 'medium', 'high', 'max'],
      },
      { id: 'claude-sonnet-5', label: 'sonnet 5', thinkingLevels: ['low', 'medium', 'high'] },
      { id: 'claude-haiku-4-5', label: 'haiku 4.5' },
    ],
  });

  protected readonly demoPermission = signal<ChatPermissionControl>({
    value: 'acceptEdits',
    options: [
      { id: 'default', label: 'Ask every time', description: 'Every tool call needs approval.' },
      {
        id: 'acceptEdits',
        label: 'Accept edits',
        description: 'File edits run unattended; commands still ask.',
      },
      {
        id: 'bypass',
        label: 'Bypass permissions',
        description: 'Everything runs unattended. Use a sandbox.',
        tone: 'warn',
      },
    ],
  });

  /** The four attached documents as hoverable toolbar pills — each tooltip
   * says what the doc is and what it costs in tokens. Clicks land in
   * (toolbarAction); this demo leaves them inert. */
  protected readonly demoDocs: readonly ChatToolbarItem[] = [
    {
      id: 'doc-api',
      glyph: 'api.md',
      variant: 'pill',
      label: 'api.md: REST contract · 6.2k tokens',
    },
    {
      id: 'doc-schema',
      glyph: 'schema.sql',
      variant: 'pill',
      label: 'schema.sql: current tables and indexes · 8.1k tokens',
    },
    {
      id: 'doc-roadmap',
      glyph: 'roadmap.md',
      variant: 'pill',
      label: 'roadmap.md: Q3 scope · 3.4k tokens',
    },
    {
      id: 'doc-adr',
      glyph: 'adr-012.md',
      variant: 'pill',
      label: 'adr-012.md: cache invalidation decision · 4.9k tokens',
    },
  ];

  /** Context snapshot: what fills the window, incl. four attached documents. */
  protected readonly demoContext: ChatContextUsage = {
    usedTokens: 74_300,
    maxTokens: 200_000,
    sections: [
      { label: 'System prompt + tools', tokens: 3_100 },
      { label: 'CLAUDE.md + project rules', tokens: 4_800 },
      { label: 'api.md · schema.sql · roadmap.md · adr-012.md', tokens: 22_600 },
      { label: 'Conversation so far', tokens: 43_800 },
    ],
    capturedAt: '2026-07-02T14:07:00.000Z',
    sourceLabel: 'Demo snapshot. Connect your /context probe here.',
  };

  protected onDemoModelCommit(selection: ChatModelSelection): void {
    this.demoModel.update((control) => ({
      ...control,
      cliType: selection.cliType,
      model: selection.model,
      thinkingLevel: selection.thinkingLevel,
    }));
  }

  protected onDemoPermissionChange(id: string): void {
    this.demoPermission.update((control) => ({ ...control, value: id }));
  }

  // --- Rendering showcase: static transcript + image lightbox ----------------
  /** Static exchange showing highlighted code + clickable images. */
  protected readonly showcaseEvents = SHOWCASE_EVENTS;
  /** The site's CHAT_MEDIA_LIGHTBOX implementation; the overlay lives in the template. */
  protected readonly lightbox = inject(WebsiteLightboxService);
  private readonly lightboxClose = viewChild<ElementRef<HTMLButtonElement>>('lightboxClose');
  /** Element to give focus back to when the dialog closes. */
  private lightboxReturnFocus: HTMLElement | null = null;
  private lightboxWasOpen = false;

  /** 1s wall-clock tick for the "last contact Ns ago" readouts. */
  private readonly now = signal(Date.now());

  /** A frame is "working" while its replay runs OR its composer reply streams. */
  protected readonly busyA = computed(() => this.replayA.playing() || this.threadA.busy());
  protected readonly busyB = computed(() => this.replayB.playing() || this.threadB.busy());
  protected readonly workingA = computed(() =>
    workingLabel(this.replayA.playing() ? this.replayA.nextKind() : this.threadA.nextKind()),
  );
  protected readonly workingB = computed(() =>
    workingLabel(this.replayB.playing() ? this.replayB.nextKind() : this.threadB.nextKind()),
  );
  protected readonly contactA = computed(() =>
    this.secondsSince(Math.max(this.replayA.lastEventAt(), this.threadA.lastAt())),
  );
  protected readonly contactB = computed(() =>
    this.secondsSince(Math.max(this.replayB.lastEventAt(), this.threadB.lastAt())),
  );

  // --- Entry-point explorer: one live, touchable sample per entry point --------
  /** Which entry point the docs explorer currently shows. */
  protected readonly explorerTab = signal<EntryPointKey>('core');
  protected readonly explorerTabs = ENTRY_POINT_TABS;
  /** Result-or-code toggle: one stage at a time instead of an ambiguous
   * side-by-side (the code card and the rendered result looked alike). */
  protected readonly explorerView = signal<'result' | 'code'>('result');
  /** The composer tab's own mini conversation (type → scripted reply). */
  protected readonly explorerChat = signal<readonly ConversationEvent[]>([]);
  protected readonly explorerThread = new ScriptedThread((e) =>
    this.explorerChat.update((list) => [...list, e]),
  );
  /** The theme tab's flippable mini surface. */
  protected readonly explorerTheme = signal<'dark' | 'light'>('dark');
  protected readonly explorerEvents = EXPLORER_EVENTS;
  protected readonly explorerEventJson = EXPLORER_EVENT_JSON;
  protected readonly explorerMarkdown = EXPLORER_MARKDOWN;
  protected readonly explorerSnippets = EXPLORER_SNIPPETS;

  // --- Sticky nav highlight ---------------------------------------------------
  protected readonly activeSection = signal<string>('');

  // --- Site-wide light / dark theme -------------------------------------------
  /** Whole-page theme. A pre-paint boot script in index.html sets the initial
   * value on <html> (stored pref, else OS preference); this mirrors it and owns
   * the in-page toggle. Distinct from the demo frames' own `demoTheme`. */
  protected readonly siteTheme = signal<'dark' | 'light'>('dark');
  protected readonly siteThemeAriaLabel = computed(() =>
    this.siteTheme() === 'dark'
      ? $localize`:@@switchToLightTheme:Switch to light theme`
      : $localize`:@@switchToDarkTheme:Switch to dark theme`,
  );
  protected readonly explorerThemeAriaLabel = computed(() =>
    this.explorerTheme() === 'dark'
      ? $localize`:@@previewLightTheme:Preview this panel in the light theme`
      : $localize`:@@previewDarkTheme:Preview this panel in the dark theme`,
  );
  protected readonly enlargedImageLabel = $localize`:@@enlargedImageLabel:Enlarged image`;
  private static readonly THEME_STORAGE_KEY = 'cac-site-theme';

  constructor() {
    this.websiteSeo.apply();
    // Modal chrome for the lightbox (focus move/restore + scroll lock): the
    // dialog markup itself lives in the template; this effect owns the parts
    // aria-modal implies but HTML doesn't do by itself.
    effect(() => {
      const open = this.lightbox.current() !== null;
      untracked(() => this.syncLightboxChrome(open));
    });
    afterNextRender(() => {
      this.syncSiteThemeFromDom();
      this.observeSections();
      this.autoplayWhenVisible();
      this.startContactTicker();
    });
    this.destroyRef.onDestroy(() => {
      this.replayA.cancel(); // cancel any scheduled replay step
      this.replayB.cancel();
      this.threadA.destroy(); // cancel any scheduled scripted reply
      this.threadB.destroy();
      this.explorerThread.destroy();
    });
  }

  /** Flip one demo frame's preview theme (the icon in its title bar). */
  protected flipFrame(key: keyof App['frameThemes']): void {
    this.frameThemes[key].update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  /** A follow-up typed under a replay: user turn + scripted reply, in place. */
  protected onFrameSubmit(key: 'a' | 'b', submit: ChatSubmitEvent): void {
    (key === 'a' ? this.threadA : this.threadB).submit(submit.text);
    // Reveal the appended turn even if the reader had scrolled up in the
    // transcript: nudge the frame's conversation to its latest row. Reaching
    // the bottom re-arms stick-to-bottom, so the streamed reply then follows
    // automatically.
    if (typeof document === 'undefined') return;
    setTimeout(() => {
      const conv = document.querySelector(`#demo-frame-${key} .conv`);
      if (conv instanceof HTMLElement) {
        if (typeof conv.scrollTo === 'function') {
          conv.scrollTo({ top: conv.scrollHeight, behavior: 'smooth' });
        } else {
          conv.scrollTop = conv.scrollHeight;
        }
      }
    }, 60);
  }

  /**
   * On open: remember the trigger, lock body scroll, move focus onto the
   * dialog's close button (screen readers then announce the dialog). On
   * close: unlock and give focus back to the trigger.
   */
  private syncLightboxChrome(open: boolean): void {
    if (typeof document === 'undefined' || open === this.lightboxWasOpen) return;
    this.lightboxWasOpen = open;
    if (open) {
      this.lightboxReturnFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.body.style.overflow = 'hidden';
      // The @if block renders after this effect settles — focus next tick.
      setTimeout(() => this.lightboxClose()?.nativeElement.focus(), 0);
    } else {
      document.body.style.overflow = '';
      const target = this.lightboxReturnFocus;
      this.lightboxReturnFocus = null;
      if (target?.isConnected) target.focus();
    }
  }

  /**
   * Lightbox keyboard contract: Escape closes, arrows page the gallery,
   * Tab is trapped inside the dialog (aria-modal promises an inert
   * background — the trap is what actually delivers it for keyboards).
   */
  protected onLightboxKey(event: KeyboardEvent): void {
    if (this.lightbox.current() === null) return;
    switch (event.key) {
      case 'Escape':
        this.lightbox.close();
        break;
      case 'ArrowRight':
        this.lightbox.next();
        break;
      case 'ArrowLeft':
        this.lightbox.prev();
        break;
      case 'Tab': {
        const dialog = document.querySelector('.lightbox');
        if (!(dialog instanceof HTMLElement)) return;
        const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('button'));
        if (buttons.length === 0) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !dialog.contains(active)) {
          first.focus(); // focus escaped (or never arrived) — pull it back in
        } else if (event.shiftKey && active === first) {
          last.focus();
        } else if (!event.shiftKey && active === last) {
          first.focus();
        } else {
          return; // normal Tab movement between the dialog's own buttons
        }
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  }

  /** Read back the theme the boot script already applied to <html>. */
  private syncSiteThemeFromDom(): void {
    const applied = document.documentElement.getAttribute('data-studio-theme');
    this.siteTheme.set(applied === 'light' ? 'light' : 'dark');
  }

  protected toggleSiteTheme(): void {
    const next = this.siteTheme() === 'dark' ? 'light' : 'dark';
    this.siteTheme.set(next);
    const root = document.documentElement;
    root.setAttribute('data-studio-theme', next);
    root.style.colorScheme = next;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', next === 'light' ? '#ffffff' : '#0f0f1a');
    try {
      localStorage.setItem(App.THEME_STORAGE_KEY, next);
    } catch {
      // Private mode / storage disabled: the toggle still works for the session.
    }
  }

  private secondsSince(epochMs: number): number {
    return Math.max(0, Math.floor((this.now() - epochMs) / 1000));
  }

  private startContactTicker(): void {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
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
