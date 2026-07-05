import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  ChatSubmitEvent,
  CliOutputLine,
  ConversationEvent,
  RawLineRange,
} from '@coding-agent/chat/core';
import { ChatComponent } from '@coding-agent/chat/composer';
import { ConversationViewComponent } from '@coding-agent/chat/conversation';
import { ProjectChatListComponent } from '@coding-agent/chat/history';

import { userTurnEvent } from './lab-fixtures';
import {
  LAB_SCENARIOS,
  findScenario,
  type LabScenario,
  type LabScenarioKind,
  type LiveScenario,
} from './lab-scenarios';
import { ScenarioPlayer, type ReplayMode } from './scenario-player';
import {
  WORKBENCH_CLI_TYPES,
  WorkbenchLiveSession,
  type WorkbenchCliType,
} from './workbench-live';

/** Lab settings that survive a reload (F5): the last theme and scenario. */
interface StoredLabSettings {
  theme?: 'dark' | 'light';
  scenarioId?: string;
}

const SETTINGS_STORAGE_KEY = 'conversation-lab.settings';

@Component({
  selector: 'app-root',
  imports: [ConversationViewComponent, ChatComponent, ProjectChatListComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly live = inject(WorkbenchLiveSession);
  protected readonly player = inject(ScenarioPlayer);

  protected readonly theme = signal<'dark' | 'light'>('dark');

  constructor() {
    // Startup state comes from two sources: localStorage remembers the last
    // session (theme + scenario survive F5), and URL params override it for
    // shareable / scriptable deep links (?theme=light|dark, ?scenario=<id>,
    // ?play=stream to start a replay as a timed stream).
    const stored = this.readStoredSettings();
    const params = new URLSearchParams(window.location.search);

    const paramTheme = params.get('theme');
    const theme = paramTheme === 'light' || paramTheme === 'dark' ? paramTheme : stored.theme;
    if (theme === 'light' || theme === 'dark') {
      this.theme.set(theme);
      document.documentElement.setAttribute('data-studio-theme', theme);
    }

    const scenarioId = params.get('scenario') ?? stored.scenarioId;
    if (typeof scenarioId === 'string' && LAB_SCENARIOS.some((s) => s.id === scenarioId)) {
      this.selectedId.set(scenarioId);
      this.activateScenario(params.get('play') === 'stream' ? 'stream' : 'instant');
    }
  }

  /** Load the selected scenario into its surface (replay player / event list). */
  private activateScenario(mode: ReplayMode): void {
    const scenario = this.scenario();
    if (scenario.kind === 'replay') {
      this.player.load(scenario, mode);
    } else if (scenario.kind === 'events') {
      this.showcaseEvents.set(scenario.events);
    }
  }

  // ── Settings persistence (survive F5) ─────────────────────────────────────

  private readStoredSettings(): StoredLabSettings {
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      return raw === null ? {} : (JSON.parse(raw) as StoredLabSettings);
    } catch {
      return {};
    }
  }

  private persistSettings(patch: StoredLabSettings): void {
    try {
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ ...this.readStoredSettings(), ...patch })
      );
    } catch {
      // Storage unavailable (e.g. blocked) — the lab still works, it just forgets.
    }
  }

  /** The scenario catalog — the lab is the place to exercise each shape. */
  protected readonly scenarios = LAB_SCENARIOS;
  protected readonly selectedId = signal<string>(LAB_SCENARIOS[0].id);
  protected readonly scenario = computed<LabScenario>(() => findScenario(this.selectedId()));

  protected readonly cliTypes = WORKBENCH_CLI_TYPES;

  /** Local state for the `events` showcase — composer submits append user turns. */
  protected readonly showcaseEvents = signal<readonly ConversationEvent[]>(
    LAB_SCENARIOS[0].kind === 'events' ? LAB_SCENARIOS[0].events : []
  );

  /** What the conversation view renders, depending on the scenario kind. */
  protected readonly events = computed<readonly ConversationEvent[]>(() => {
    switch (this.scenario().kind) {
      case 'live':
        return this.live.events();
      case 'replay':
        return this.player.events();
      default:
        return this.showcaseEvents();
    }
  });

  protected readonly liveScenario = computed<LiveScenario | null>(() => {
    const scenario = this.scenario();
    return scenario.kind === 'live' ? scenario : null;
  });

  /** Drives the view's "Working" indicator: replay = stream playing, live = CLI run active. */
  protected readonly conversationRunning = computed<boolean>(() => {
    switch (this.scenario().kind) {
      case 'live':
        return this.live.running();
      case 'replay':
        return this.player.playing();
      default:
        return false;
    }
  });

  protected readonly composerPlaceholder = computed(() => {
    switch (this.scenario().kind) {
      case 'live':
        return 'Prompt an die echte CLI — die erste Nachricht startet die Session';
      case 'replay':
        return 'Eigener User-Turn — wird als user-Zeile durch die Projektion geschickt';
      default:
        return 'Steer the agent — Enter sends, Shift+Enter breaks the line';
    }
  });

  /**
   * "What this chat is about", fed into `cac-chat`'s optional `contextLabel`.
   * Fixture scenarios have no real project/task to bind to, so they get
   * null — the toolbar chip disappears entirely rather than showing a
   * placeholder that doesn't mean anything.
   */
  protected readonly composerContextLabel = computed<string | null>(() => {
    const scenario = this.scenario();
    switch (scenario.kind) {
      case 'live':
        return `Workbench-Sandbox · ${scenario.title}`;
      case 'replay':
        return `conversation-lab · ${scenario.title}`;
      default:
        return null;
    }
  });

  protected toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    document.documentElement.setAttribute('data-studio-theme', next);
    this.persistSettings({ theme: next });
  }

  protected selectScenario(id: string): void {
    if (this.selectedId() === id) {
      return;
    }
    const previous = this.scenario();
    this.selectedId.set(id);
    this.persistSettings({ scenarioId: id });

    if (previous.kind === 'live' && this.scenario().kind !== 'live') {
      void this.live.stop();
    }
    this.activateScenario('instant');
  }

  protected kindLabel(kind: LabScenarioKind): string {
    switch (kind) {
      case 'live':
        return 'Live';
      case 'replay':
        return 'Replay';
      default:
        return 'Fixture';
    }
  }

  // ── Live controls ─────────────────────────────────────────────────────────

  protected setWorkbenchUrl(value: string): void {
    this.live.baseUrl.set(value);
  }

  protected setCliType(value: string): void {
    this.live.cliType.set(value as WorkbenchCliType);
  }

  protected connectLive(): void {
    void this.live.connect();
  }

  protected stopLive(): void {
    void this.live.stop();
  }

  /**
   * Run the selected live scenario reproducibly: tear down any previous
   * session, health-check the workbench, then send the preset prompt as the
   * first message of a FRESH session.
   */
  protected async startLiveScenario(): Promise<void> {
    const scenario = this.liveScenario();
    if (scenario === null) {
      return;
    }
    if (scenario.cliType !== undefined) {
      this.live.cliType.set(scenario.cliType);
    }
    await this.live.stop();
    await this.live.connect();
    if (this.live.connection() === 'connected') {
      await this.live.submit(scenario.prompt);
    }
  }

  /** Send the scenario's suggested follow-up — exercises the resume chain. */
  protected sendFollowUp(): void {
    const followUp = this.liveScenario()?.followUp;
    if (followUp !== undefined && this.live.sessionId() !== null) {
      void this.live.submit(followUp);
    }
  }

  // ── Trace drawer ──────────────────────────────────────────────────────────

  protected readonly traceOpen = signal(false);
  protected readonly traceRange = signal<RawLineRange | null>(null);

  /** Raw projection input of the active scenario — what the Trace drawer lists. */
  protected readonly traceLines = computed<readonly CliOutputLine[]>(() => {
    switch (this.scenario().kind) {
      case 'live':
        return this.live.rawLines();
      case 'replay':
        return this.player.visibleLines();
      default:
        // Fixture scenarios feed ready-made events; there is no activity log.
        return [];
    }
  });

  /**
   * `openTrace` from the conversation view (header button emits null, row
   * buttons emit their raw range). The Debug button opens the same raw view
   * without a highlight — in the lab both map onto the projection input.
   */
  protected openTrace(range: RawLineRange | null): void {
    this.traceRange.set(range);
    this.traceOpen.set(true);
    if (range !== null) {
      // After the drawer renders, bring the highlighted range into view.
      // (Optional call: jsdom in tests does not implement scrolling.)
      setTimeout(() => {
        document.querySelector('.lab-trace__line--hit')?.scrollIntoView?.({ block: 'center' });
      });
    }
  }

  protected closeTrace(): void {
    this.traceOpen.set(false);
  }

  protected isTraceLineHit(index: number): boolean {
    const range = this.traceRange();
    if (range === null) {
      return false;
    }
    const line = index + 1; // RawLineRange is 1-based and inclusive.
    return line >= range.start && line <= range.end;
  }

  // ── Composer ──────────────────────────────────────────────────────────────

  protected onComposerSubmit(submit: ChatSubmitEvent): void {
    const text = submit.text.trim();
    if (text.length === 0) {
      return;
    }
    switch (this.scenario().kind) {
      case 'live':
        void this.live.submit(text);
        return;
      case 'replay':
        this.player.appendUserLine(text);
        return;
      default:
        this.showcaseEvents.update((list) => [...list, userTurnEvent(text)]);
    }
  }
}
