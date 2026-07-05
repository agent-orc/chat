import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { ChatSubmitEvent, ConversationEvent } from '@coding-agent/chat/core';
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
import { ScenarioPlayer } from './scenario-player';
import {
  WORKBENCH_CLI_TYPES,
  WorkbenchLiveSession,
  type WorkbenchCliType,
} from './workbench-live';

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

  protected readonly composerEmptyState = computed(() => {
    switch (this.scenario().kind) {
      case 'live':
        return 'Live-Modus: Nachrichten gehen an den Workbench-Host und starten echte CLI-Runs.';
      case 'replay':
        return 'Replay-Modus: Submits werden als rohe user-Zeilen projiziert — wie im Live-Betrieb.';
      default:
        return 'Type below: submits append a user turn to the conversation above.';
    }
  });

  protected toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    document.documentElement.setAttribute('data-studio-theme', next);
  }

  protected selectScenario(id: string): void {
    if (this.selectedId() === id) {
      return;
    }
    const previous = this.scenario();
    this.selectedId.set(id);
    const next = this.scenario();

    if (previous.kind === 'live' && next.kind !== 'live') {
      void this.live.stop();
    }
    if (next.kind === 'replay') {
      this.player.load(next, 'instant');
    } else if (next.kind === 'events') {
      this.showcaseEvents.set(next.events);
    }
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
