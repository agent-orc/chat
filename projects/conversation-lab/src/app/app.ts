import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import type {
  ChatCliOption,
  ChatContextUsage,
  ChatModelControl,
  ChatModelOption,
  ChatModelSelection,
  ChatPermissionControl,
  ChatSubmitEvent,
  CliOutputLine,
  ConversationEvent,
  RawLineRange,
} from 'coding-agent-chat/core';
import { shortModelLabel } from 'coding-agent-chat/core';
import { ChatComponent } from 'coding-agent-chat/composer';
import { ConversationViewComponent } from 'coding-agent-chat/conversation';

import { userTurnEvent } from './lab-fixtures';
import {
  LAB_SCENARIOS,
  findScenario,
  type LabScenario,
  type LabScenarioKind,
  type LiveScenario,
} from './lab-scenarios';
import { LabLightboxService } from './lab-lightbox.service';
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
  imports: [ConversationViewComponent, ChatComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly live = inject(WorkbenchLiveSession);
  protected readonly player = inject(ScenarioPlayer);
  protected readonly lightbox = inject(LabLightboxService);

  /** Keyboard control for the image lightbox overlay (Escape / arrows). */
  protected onLightboxKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.lightbox.close();
    else if (event.key === 'ArrowRight') this.lightbox.next();
    else if (event.key === 'ArrowLeft') this.lightbox.prev();
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKey(event: KeyboardEvent): void {
    if (this.lightbox.current()) this.onLightboxKey(event);
  }

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
      await this.live.submit(scenario.prompt, this.labPermission().value);
    }
  }

  /** Send the scenario's suggested follow-up — exercises the resume chain. */
  protected sendFollowUp(): void {
    const followUp = this.liveScenario()?.followUp;
    if (followUp !== undefined && this.live.sessionId() !== null) {
      void this.live.submit(followUp, this.labPermission().value);
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

  // ── Composer footer controls (show-by-default demo) ───────────────────────
  // The library's <cac-chat> renders the model selector, permission select and
  // context ring as soon as the host feeds each one's data — so the lab wires
  // static demo data (a real host feeds the model catalog from the backend)
  // and lets the user drive them. Turning a control off is a one-line
  // [showModelControl]="false" etc. on <cac-chat>.

  private readonly cliOptions: readonly ChatCliOption[] = [
    { id: 'claude', label: 'Claude Code', icon: '✳' },
    { id: 'codex', label: 'Codex', icon: '◆' },
  ];
  private readonly catalogByCli: Record<string, readonly ChatModelOption[]> = {
    claude: [
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', isDefault: true, thinkingLevels: ['low', 'medium', 'high', 'xhigh', 'max'], defaultThinkingLevel: 'high' },
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', thinkingLevels: ['low', 'medium', 'high', 'xhigh', 'max'], defaultThinkingLevel: 'high' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    ],
    codex: [
      { id: 'gpt-5-codex', label: 'GPT-5 Codex', isDefault: true },
    ],
  };

  protected readonly labCli = signal<string>('claude');
  protected readonly labModel = signal<string>('claude-sonnet-5');
  protected readonly labThinking = signal<string | null>('high');
  /** Which CLI the currently exposed catalog belongs to (answers catalogRequested). */
  private readonly labCatalogCli = signal<string>('claude');

  protected readonly labModelControl = computed<ChatModelControl>(() => ({
    cliOptions: this.cliOptions,
    cliType: this.labCli(),
    model: this.labModel(),
    thinkingLevel: this.labThinking(),
    catalog: this.catalogByCli[this.labCatalogCli()] ?? [],
  }));

  protected readonly labPermission = signal<ChatPermissionControl>({
    options: [
      { id: 'yolo', label: 'YOLO', tone: 'warn', description: 'Skip every permission / sandbox / trust prompt.' },
      { id: 'workspace-write', label: 'Workspace write', description: 'Auto-approve edits inside the workspace.' },
      { id: 'read-only', label: 'Read-only', description: 'Inspect without mutating.' },
      { id: 'custom', label: 'Custom (global config)', description: "Defer to the CLI's own global config." },
    ],
    value: 'yolo',
  });

  protected readonly labContext = signal<ChatContextUsage>({
    usedTokens: 76_400,
    maxTokens: 200_000,
    sections: [
      { label: 'System prompt', tokens: 3_100 },
      { label: 'Tools & MCP', tokens: 18_200 },
      { label: 'Messages', tokens: 55_100 },
    ],
    sourceLabel: 'via /context',
    capturedAt: new Date().toISOString(),
  });
  protected readonly labContextBusy = signal(false);

  protected onModelCatalogRequested(cli: string): void {
    // Static demo: point the exposed catalog at the requested CLI's list.
    this.labCatalogCli.set(cli);
  }

  protected onModelCommit(sel: ChatModelSelection): void {
    const previous = this.labModel();
    this.labCli.set(sel.cliType);
    this.labModel.set(sel.model);
    this.labThinking.set(sel.thinkingLevel);
    // Surface the switch as a "Model changed" notice in the transcript, the
    // same shape the projection produces from a real backend marker.
    if (previous !== sel.model) {
      this.appendModelChangeNotice(previous, sel.model);
    }
  }

  protected onContextRefresh(): void {
    // Simulate a fresh /context probe.
    this.labContextBusy.set(true);
    setTimeout(() => {
      this.labContext.update((u) => ({ ...u, capturedAt: new Date().toISOString() }));
      this.labContextBusy.set(false);
    }, 350);
  }

  protected onPermissionChange(mode: string): void {
    this.labPermission.update((p) => ({ ...p, value: mode }));
  }

  private appendModelChangeNotice(from: string, to: string): void {
    const label = (id: string): string => (id.length === 0 ? 'CLI default' : shortModelLabel(id));
    const event: ConversationEvent = {
      id: `lab-model-change-${this.showcaseEvents().length}-${to}`,
      kind: 'system.status',
      timestamp: new Date().toISOString(),
      rawRange: { source: 'conversation-lab', start: 1, end: 1 },
      severity: 'info',
      category: 'model-change',
      label: 'Model changed',
      explanation: `${label(from)} → ${label(to)}`,
    };
    this.showcaseEvents.update((list) => [...list, event]);
  }

  // ── Composer ──────────────────────────────────────────────────────────────

  protected onComposerSubmit(submit: ChatSubmitEvent): void {
    const text = submit.text.trim();
    if (text.length === 0) {
      return;
    }
    switch (this.scenario().kind) {
      case 'live':
        void this.live.submit(text, this.labPermission().value);
        return;
      case 'replay':
        this.player.appendUserLine(text);
        return;
      default:
        this.showcaseEvents.update((list) => [...list, userTurnEvent(text)]);
    }
  }
}
