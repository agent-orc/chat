import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { ChatSubmitEvent, ConversationEvent } from '@coding-agent/chat/core';
import { ChatComponent } from '@coding-agent/chat/composer';
import { ConversationViewComponent } from '@coding-agent/chat/conversation';
import { ProjectChatListComponent } from '@coding-agent/chat/history';

import { LAB_CONVERSATION_EVENTS, userTurnEvent } from './lab-fixtures';

@Component({
  selector: 'app-root',
  imports: [ConversationViewComponent, ChatComponent, ProjectChatListComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly theme = signal<'dark' | 'light'>('dark');

  /** Local conversation state — composer submits append user turns here. */
  protected readonly events = signal<readonly ConversationEvent[]>(LAB_CONVERSATION_EVENTS);

  protected toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    document.documentElement.setAttribute('data-studio-theme', next);
  }

  protected onComposerSubmit(submit: ChatSubmitEvent): void {
    const text = submit.text.trim();
    if (text.length === 0) {
      return;
    }
    this.events.update((list) => [...list, userTurnEvent(text)]);
  }
}
