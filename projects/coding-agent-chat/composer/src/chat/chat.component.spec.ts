/**
 * Specs for the reusable <cac-chat> surface: empty state, message rendering,
 * submitMessage emission, draft-attachment staging, and toolbar behaviour.
 */
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ChatContextUsage,
  ChatMessage,
  ChatModelControl,
  ChatModelSelection,
  ChatPermissionControl,
  ChatSubmitEvent,
  ChatToolbarItem,
} from '@coding-agent/chat/core';
import { ChatComponent } from './chat.component';

const message = (
  id: string,
  role: ChatMessage['role'],
  text: string,
  timestamp = '2026-01-01T10:00:00.000Z'
): ChatMessage => ({ id, role, text, timestamp });

async function createChat(
  inputs: Record<string, unknown> = {}
): Promise<ComponentFixture<ChatComponent>> {
  const fixture = TestBed.createComponent(ChatComponent);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return fixture;
}

function query<T extends Element>(fixture: ComponentFixture<ChatComponent>, selector: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
}

/** Type into the composer textarea through the DOM so ngModel updates. */
async function typeDraft(fixture: ComponentFixture<ChatComponent>, text: string): Promise<HTMLTextAreaElement> {
  const textarea = query<HTMLTextAreaElement>(fixture, '[data-testid="chat-input"]')!;
  textarea.value = text;
  textarea.dispatchEvent(new Event('input'));
  await fixture.whenStable();
  return textarea;
}

/** Simulate a file drop without a real DataTransfer (jsdom has none). */
function dropFiles(fixture: ComponentFixture<ChatComponent>, files: File[]): void {
  fixture.componentInstance.onDrop({
    dataTransfer: { files },
    preventDefault: () => {},
  } as unknown as DragEvent);
}

const pngFile = (name = 'shot.png', bytes = 16): File =>
  new File([new Uint8Array(bytes)], name, { type: 'image/png' });

describe('ChatComponent', () => {
  beforeEach(() => {
    // jsdom has no object-URL implementation; the draft-staging path needs one.
    let counter = 0;
    Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:test-${++counter}`),
      revokeObjectURL: vi.fn(),
    });
  });

  it('renders the configured empty state when there are no messages or events', async () => {
    const fixture = await createChat({ emptyState: 'Nothing here yet.' });

    expect(query(fixture, '[data-testid="chat-empty"]')?.textContent?.trim()).toBe('Nothing here yet.');
    expect(query(fixture, '[data-testid="chat-msg-user"]')).toBeNull();
  });

  it('renders no body strip at all when there are no messages and emptyState is blank', async () => {
    const fixture = await createChat({ emptyState: '' });

    expect(query(fixture, '[data-testid="chat-empty"]')).toBeNull();
    expect(query(fixture, '[data-testid="chat-body"]')).toBeNull();
  });

  it('renders the message list with role-specific rows and a role badge for agent turns', async () => {
    const fixture = await createChat({
      messages: [
        message('m1', 'user', 'Hello **world**', '2026-01-01T10:00:00.000Z'),
        message('m2', 'agent', 'On it.', '2026-01-01T10:01:00.000Z'),
      ],
    });

    expect(query(fixture, '[data-testid="chat-empty"]')).toBeNull();
    const userRow = query(fixture, '[data-testid="chat-msg-user"]')!;
    const agentRow = query(fixture, '[data-testid="chat-msg-agent"]')!;
    expect(userRow.querySelector('.chat__msg-role')?.textContent?.trim()).toBe('You');
    expect(userRow.textContent).toContain('world');
    // Agent turns get the workforce badge instead of a plain label;
    // the bare 'agent' author resolves to the Task Executor.
    expect(agentRow.querySelector('[data-testid="role-badge-task-executor"]')).toBeTruthy();
    expect(agentRow.textContent).toContain('On it.');
  });

  it('emits submitMessage with the trimmed draft and resets the composer', async () => {
    const fixture = await createChat();
    const emissions: ChatSubmitEvent[] = [];
    fixture.componentInstance.submitMessage.subscribe((e) => emissions.push(e));

    const sendBtn = query<HTMLButtonElement>(fixture, '[data-testid="chat-send"]')!;
    expect(sendBtn.disabled).toBe(true); // empty draft cannot be sent

    await typeDraft(fixture, '  hello world  ');
    expect(sendBtn.disabled).toBe(false);

    query<HTMLFormElement>(fixture, 'form.chat__composer')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();

    expect(emissions).toHaveLength(1);
    expect(emissions[0]).toEqual({ text: 'hello world', attachments: [] });
    expect(fixture.componentInstance.draftText).toBe('');
    expect(sendBtn.disabled).toBe(true);
  });

  it('sends on Enter but not on Shift+Enter', async () => {
    const fixture = await createChat();
    const emissions: ChatSubmitEvent[] = [];
    fixture.componentInstance.submitMessage.subscribe((e) => emissions.push(e));

    const textarea = await typeDraft(fixture, 'line one');
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true }));
    await fixture.whenStable();
    expect(emissions).toHaveLength(0);

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    await fixture.whenStable();
    expect(emissions).toHaveLength(1);
    expect(emissions[0].text).toBe('line one');
  });

  it('does not emit while disabled', async () => {
    const fixture = await createChat({ disabled: true });
    const emissions: ChatSubmitEvent[] = [];
    fixture.componentInstance.submitMessage.subscribe((e) => emissions.push(e));

    fixture.componentInstance.draftText = 'blocked';
    fixture.componentInstance.onSubmit(new Event('submit', { cancelable: true }));

    expect(emissions).toHaveLength(0);
  });

  it('stages dropped images as draft attachments and includes them in the submit', async () => {
    const fixture = await createChat();
    const emissions: ChatSubmitEvent[] = [];
    fixture.componentInstance.submitMessage.subscribe((e) => emissions.push(e));

    dropFiles(fixture, [pngFile('screen-grab.png'), new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    await fixture.whenStable();

    // Only the image survives the filter; alt derives from the file stem.
    const drafts = fixture.componentInstance.drafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].alt).toBe('screen-grab');
    expect(query(fixture, '[data-testid="chat-drafts"]')?.textContent).toContain('screen-grab');
    // A staged attachment alone is submittable (no text required).
    expect(query<HTMLButtonElement>(fixture, '[data-testid="chat-send"]')!.disabled).toBe(false);

    query<HTMLFormElement>(fixture, 'form.chat__composer')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();

    expect(emissions).toHaveLength(1);
    expect(emissions[0].text).toBe('');
    expect(emissions[0].attachments).toHaveLength(1);
    expect(emissions[0].attachments[0].alt).toBe('screen-grab');
    expect(fixture.componentInstance.drafts()).toHaveLength(0);
  });

  it('rejects attachments above maxAttachmentBytes with an inline error', async () => {
    const fixture = await createChat({ maxAttachmentBytes: 8 });

    dropFiles(fixture, [pngFile('huge.png', 64)]);
    await fixture.whenStable();

    expect(fixture.componentInstance.drafts()).toHaveLength(0);
    expect(fixture.componentInstance.attachmentError()).toContain('Image too large');
    expect(query(fixture, '.chat__attachment-error')?.textContent).toContain('Image too large');
  });

  it('removing a staged draft revokes its preview URL', async () => {
    const fixture = await createChat();
    dropFiles(fixture, [pngFile()]);
    await fixture.whenStable();

    const draft = fixture.componentInstance.drafts()[0];
    fixture.componentInstance.removeDraftAttachment(draft.id);
    await fixture.whenStable();

    expect(fixture.componentInstance.drafts()).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(draft.previewUrl);
    expect(query(fixture, '[data-testid="chat-drafts"]')).toBeNull();
  });

  it('renders toolbar items plus context and routing labels, and emits toolbarAction on click', async () => {
    const start: ChatToolbarItem[] = [{ id: 'ref', glyph: '#', label: 'Reference a task' }];
    const end: ChatToolbarItem[] = [{ id: 'slash', glyph: '/', label: 'Quick action', variant: 'pill' }];
    const fixture = await createChat({
      toolbarStart: start,
      toolbarEnd: end,
      contextLabel: 'acme-website · Fix login redirect',
      routingLabel: 'routing: Codex',
    });
    const actions: { id: string }[] = [];
    fixture.componentInstance.toolbarAction.subscribe((a) => actions.push(a));

    expect(query(fixture, '[data-testid="chat-toolbar"]')).toBeTruthy();
    const refBtn = query<HTMLButtonElement>(fixture, '[data-testid="chat-toolbar-ref"]')!;
    expect(refBtn.textContent?.trim()).toBe('#');
    expect(refBtn.getAttribute('aria-label')).toBe('Reference a task');
    expect(
      query(fixture, '[data-testid="chat-toolbar-slash"]')?.classList.contains('chat__toolbar-btn--pill')
    ).toBe(true);
    expect(query(fixture, '[data-testid="chat-toolbar-context"]')?.textContent?.trim())
      .toBe('acme-website · Fix login redirect');
    expect(query(fixture, '[data-testid="chat-toolbar-routing"]')?.textContent?.trim())
      .toBe('routing: Codex');

    refBtn.click();
    await fixture.whenStable();
    expect(actions).toEqual([{ id: 'ref' }]);
  });

  it('hides the toolbar row entirely when no toolbar inputs are set', async () => {
    const fixture = await createChat();
    expect(query(fixture, '[data-testid="chat-toolbar"]')).toBeNull();
  });

  it('shows the toolbar row for contextLabel alone, with no other toolbar inputs', async () => {
    const fixture = await createChat({ contextLabel: 'conversation-lab · Live scenario' });
    expect(query(fixture, '[data-testid="chat-toolbar-context"]')?.textContent?.trim())
      .toBe('conversation-lab · Live scenario');
  });

  const MODEL_CONTROL: ChatModelControl = {
    cliOptions: [{ id: 'claude', label: 'Claude Code', icon: '✳' }],
    cliType: 'claude',
    model: 'claude-sonnet-5',
    catalog: [
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', isDefault: true },
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
    ],
  };
  const PERMISSION_CONTROL: ChatPermissionControl = {
    options: [
      { id: 'yolo', label: 'YOLO', tone: 'warn' },
      { id: 'read-only', label: 'Read-only' },
    ],
    value: 'yolo',
  };
  const CONTEXT_USAGE: ChatContextUsage = { usedTokens: 76_400, maxTokens: 200_000 };

  it('shows the model selector by default once the host supplies its config', async () => {
    const fixture = await createChat({ modelControl: MODEL_CONTROL });
    expect(query(fixture, 'cac-model-selector')).toBeTruthy();
    // The chip renders the current model label.
    expect(query(fixture, '[data-testid="cac-model-selector-trigger"]')?.textContent)
      .toContain('sonnet 5');
  });

  it('shows the context ring once the host supplies a usage snapshot', async () => {
    const fixture = await createChat({ contextUsage: CONTEXT_USAGE });
    expect(query(fixture, 'cac-context-ring')).toBeTruthy();
    expect(query(fixture, '[data-testid="cac-context-ring-percent"]')?.textContent).toContain('38%');
  });

  it('shows the permission select once the host supplies options', async () => {
    const fixture = await createChat({ permissionControl: PERMISSION_CONTROL });
    expect(query(fixture, 'cac-permission-select')).toBeTruthy();
  });

  it('hides a control on demand even when its data is present', async () => {
    const fixture = await createChat({
      modelControl: MODEL_CONTROL,
      showModelControl: false,
      contextUsage: CONTEXT_USAGE,
      showContextRing: false,
      permissionControl: PERMISSION_CONTROL,
      showPermissionControl: false,
    });
    expect(query(fixture, 'cac-model-selector')).toBeNull();
    expect(query(fixture, 'cac-context-ring')).toBeNull();
    expect(query(fixture, 'cac-permission-select')).toBeNull();
    // With no controls and no projected footer content, the footer row collapses.
    expect(query(fixture, '[data-testid="chat-composer-foot"] cac-model-selector')).toBeNull();
  });

  it('renders no footer controls for a plain chat (dataless host unaffected)', async () => {
    const fixture = await createChat({ messages: [message('m1', 'user', 'hi')] });
    expect(query(fixture, 'cac-model-selector')).toBeNull();
    expect(query(fixture, 'cac-context-ring')).toBeNull();
    expect(query(fixture, 'cac-permission-select')).toBeNull();
  });

  it('forwards the built-in selector commit up as modelCommit', async () => {
    const fixture = await createChat({ modelControl: MODEL_CONTROL });
    const commits: ChatModelSelection[] = [];
    fixture.componentInstance.modelCommit.subscribe((c) => commits.push(c));
    // Drive the embedded selector directly (its own picker flow is covered by
    // the model-selector spec); assert cac-chat forwards the event.
    const trigger = query<HTMLButtonElement>(fixture, '[data-testid="cac-model-selector-trigger"]')!;
    trigger.click();
    await fixture.whenStable();
    // Pick a DIFFERENT model than the committed one so the selector auto-commits.
    const pill = query<HTMLButtonElement>(fixture, '[data-testid="cac-model-selector-picker-model-claude-opus-4-8"]')!;
    pill.click();
    await fixture.whenStable();
    expect(commits).toHaveLength(1);
    expect(commits[0].model).toBe('claude-opus-4-8');
  });

  it('renders a notice message as a centered divider instead of a bubble', async () => {
    const fixture = await createChat({
      messages: [
        message('m1', 'user', 'hi'),
        {
          ...message('n1', 'system', 'Model changed: Sonnet 5 → Opus 4.8'),
          presentation: 'notice' as const,
        },
      ],
    });
    const notice = query(fixture, '[data-testid="chat-notice"]');
    expect(notice).toBeTruthy();
    expect(notice?.textContent).toContain('Model changed: Sonnet 5 → Opus 4.8');
    // The notice replaces the bubble — no system-role article for this turn.
    expect(query(fixture, '[data-testid="chat-msg-system"]')).toBeNull();
  });
});
