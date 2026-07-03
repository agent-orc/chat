import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { ChatSubmitEvent, ConversationEvent } from '@coding-agent/chat/core';
import { ChatComponent } from '@coding-agent/chat/composer';
import { ConversationViewComponent } from '@coding-agent/chat/conversation';
import { ProjectChatListComponent } from '@coding-agent/chat/history';

import { LAB_CONVERSATION_EVENTS, userTurnEvent } from './lab-fixtures';
import {
  WORKBENCH_CLI_TYPES,
  WorkbenchLiveSession,
  type WorkbenchCliType,
} from './workbench-live';

type LabMode = 'demo' | 'live';

@Component({
  selector: 'app-root',
  imports: [ConversationViewComponent, ChatComponent, ProjectChatListComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly live = inject(WorkbenchLiveSession);

  protected readonly theme = signal<'dark' | 'light'>('dark');

  /** Demo | Workbench (live) — live renders a real CLI transcript. */
  protected readonly mode = signal<LabMode>('demo');
  protected readonly cliTypes = WORKBENCH_CLI_TYPES;

  /** Local demo conversation state — composer submits append user turns here. */
  protected readonly demoEvents = signal<readonly ConversationEvent[]>(LAB_CONVERSATION_EVENTS);

  /** What the conversation view renders: fixtures (demo) or the projected live feed. */
  protected readonly events = computed<readonly ConversationEvent[]>(() =>
    this.mode() === 'live' ? this.live.events() : this.demoEvents()
  );

  protected readonly composerPlaceholder = computed(() =>
    this.mode() === 'live'
      ? 'Prompt an die echte CLI — die erste Nachricht startet die Session'
      : 'Steer the agent — Enter sends, Shift+Enter breaks the line'
  );

  protected readonly composerEmptyState = computed(() =>
    this.mode() === 'live'
      ? 'Live-Modus: Nachrichten gehen an den Workbench-Host und starten echte CLI-Runs.'
      : 'Type below: submits append a user turn to the conversation above.'
  );

  protected toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    document.documentElement.setAttribute('data-studio-theme', next);
  }

  protected setMode(mode: LabMode): void {
    if (this.mode() === mode) {
      return;
    }
    this.mode.set(mode);
    if (mode === 'demo') {
      void this.live.stop();
    }
  }

  protected setWorkbenchUrl(value: string): void {
    this.live.baseUrl.set(value);
  }

  protected setCliType(value: string): void {
    this.live.cliType.set(value as WorkbenchCliType);
  }

  protected startLive(): void {
    void this.live.connect();
  }

  protected stopLive(): void {
    void this.live.stop();
  }

  protected onComposerSubmit(submit: ChatSubmitEvent): void {
    const text = submit.text.trim();
    if (text.length === 0) {
      return;
    }
    if (this.mode() === 'live') {
      void this.live.submit(text);
      return;
    }
    this.demoEvents.update((list) => [...list, userTurnEvent(text)]);
  }
}
