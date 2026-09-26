// Covers the ConversationView row builder + template over hand-built ConversationEvent
// fixtures: message grouping (user/agent), tool bursts + visibility toggle, run markers
// (start filtering, session-id seeding), orchestrator decisions, image events, the
// session-init meta card lift, and the empty-feed state.

import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { CHAT_TURN_METADATA_OPTIONS, StickToBottomDirective } from 'coding-agent-chat/shared';

import type {
  ArtifactImageEvent,
  ConversationEvent,
  MessageEvent,
  OrchestratorDecisionEvent,
  PlanItem,
  PlanUpdateEvent,
  RawLineRange,
  RunMarkerEvent,
  SupervisorWaitEvent,
  SystemUnknownFrameEvent,
  ToolBurstEvent,
} from '../../../core/src/public-api';
import {
  codexStructuredWorkPhaseFragment,
  codexTextModeStderrTranscriptFragment,
  projectConversation,
} from '../../../core/src/public-api';

import { ConversationViewComponent } from './conversation-view.component';

const RANGE: RawLineRange = { source: 'cli-output.log', start: 1, end: 2 };

let seq = 0;
function nextTs(): string {
  seq += 1;
  return new Date(Date.UTC(2026, 4, 5, 12, 0, seq)).toISOString();
}

function msg(
  kind: MessageEvent['kind'],
  body: string,
  overrides: Partial<Omit<MessageEvent, 'kind'>> = {},
): MessageEvent {
  seq += 1;
  return {
    id: `msg-${seq}`,
    kind,
    timestamp: nextTs(),
    actor: kind,
    body,
    rawRange: RANGE,
    ...overrides,
  };
}

function burst(overrides: Partial<Omit<ToolBurstEvent, 'kind'>> = {}): ToolBurstEvent {
  seq += 1;
  return {
    id: `burst-${seq}`,
    kind: 'toolBurst',
    timestamp: nextTs(),
    count: 3,
    families: { read: 2, edit: 1 },
    failures: 0,
    durationMs: 1500,
    rawRange: RANGE,
    ...overrides,
  };
}

function planUpdate(items: PlanItem[]): PlanUpdateEvent {
  seq += 1;
  return { id: `plan-${seq}`, kind: 'plan.update', timestamp: nextTs(), items, rawRange: RANGE };
}

function supervisorWait(
  state: SupervisorWaitEvent['state'],
  quietSeconds: number,
  overrides: Partial<Omit<SupervisorWaitEvent, 'kind' | 'state' | 'quietSeconds'>> = {},
): SupervisorWaitEvent {
  seq += 1;
  return {
    id: `wait-${seq}`,
    kind: 'supervisor.wait',
    timestamp: nextTs(),
    state,
    quietSeconds,
    rawRange: RANGE,
    ...overrides,
  };
}

async function render(events: readonly ConversationEvent[], inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(ConversationViewComponent);
  fixture.componentRef.setInput('events', events);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('ConversationViewComponent', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders only declared assistant facts and a session summary, then obeys opt-out', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CHAT_TURN_METADATA_OPTIONS,
          useValue: {
            capabilities: {
              'codex-exec': {
                fields: [
                  'model',
                  'tokens.input',
                  'tokens.output',
                  'cost.amount',
                  'cost.currency',
                  'durations.totalMs',
                ],
              },
            },
          },
        },
      ],
    });
    const turnMetadata = {
      mode: 'codex-exec',
      model: 'gpt-example',
      provider: 'OpenAI',
      tokens: { input: 20, output: 5, reasoning: 2 },
      cost: { amount: 0.01, currency: 'USD' },
      durations: { totalMs: 2000 },
    };
    const events = [
      msg('message.user', 'Question', { turnMetadata }),
      msg('message.taskAgent', 'Answer', { turnMetadata }),
    ];
    const fixture = await render(events);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('[data-testid="turn-metadata-line"]')).toHaveLength(1);
    expect(root.querySelector('[data-testid="turn-metadata-line"]')?.textContent).toContain('25');
    expect(root.querySelector('[data-testid="turn-metadata-line"]')?.textContent).not.toContain(
      'OpenAI',
    );
    expect(
      root.querySelector('[data-testid="conversation-metadata-summary"]')?.textContent,
    ).toContain('1 turn · 25 reported tokens · 0.01 USD · average latency 2.0 s');
    fixture.componentRef.setInput('metadataEnabled', false);
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="turn-metadata-line"]')).toBeNull();
    expect(root.querySelector('[data-testid="conversation-metadata-summary"]')).toBeNull();
  });

  it('shows the shared compact indicator on an attributed message boundary', async () => {
    const fixture = await render([
      msg('message.taskAgent', 'Working.', { model: 'gpt-5-codex', thinkingLevel: 'high' }),
    ]);
    const indicator = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="conversation-message-model"]',
    );

    expect(indicator?.textContent?.replace(/\s/g, '')).toBe('CDXH');
    expect(indicator?.querySelector('.model-level')?.getAttribute('title')).toBe(
      'gpt-5-codex, thinking high',
    );
  });

  it('starts a new labelled boundary when only the thinking level changes', async () => {
    const fixture = await render([
      msg('message.taskAgent', 'First pass.', { model: 'gpt-5-codex', thinkingLevel: 'low' }),
      msg('message.taskAgent', 'Deeper pass.', { model: 'gpt-5-codex', thinkingLevel: 'high' }),
    ]);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      '[data-actor="message.taskAgent"]',
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-show-header')).toBe('true');
    expect(rows[1].getAttribute('data-show-header')).toBe('true');
    expect(
      rows[0]
        .querySelector('[data-testid="conversation-message-model"]')
        ?.textContent?.replace(/\s/g, ''),
    ).toBe('CDXL');
    expect(
      rows[1]
        .querySelector('[data-testid="conversation-message-model"]')
        ?.textContent?.replace(/\s/g, ''),
    ).toBe('CDXH');
  });

  it('renders Codex text-mode stderr as one compact system row and keeps the stdout reply visible', async () => {
    const events = projectConversation({
      source: 'fixture-job',
      lines: codexTextModeStderrTranscriptFragment(),
    });
    const fixture = await render(events);
    const el: HTMLElement = fixture.nativeElement;
    const openedRanges: Array<RawLineRange | null> = [];
    fixture.componentInstance.openTrace.subscribe((range) => openedRanges.push(range));

    const statusRows = el.querySelectorAll('[data-testid="conversation-system-status"]');
    expect(statusRows).toHaveLength(1);
    expect(statusRows[0].textContent).toContain('Codex transcript');
    expect(statusRows[0].textContent).not.toContain('/**');
    expect(statusRows[0].textContent).not.toContain('* 10,975 contiguous stderr lines');
    const traceButton = statusRows[0].querySelector<HTMLButtonElement>(
      '[data-testid="conversation-status-open-trace"]',
    );
    expect(traceButton).toBeTruthy();
    traceButton!.click();
    expect(openedRanges).toEqual([events[0].rawRange]);
    expect(openedRanges[0]).toEqual({ source: 'fixture-job', start: 1, end: 19 });

    const agentRows = el.querySelectorAll('[data-actor="message.taskAgent"]');
    expect(agentRows).toHaveLength(1);
    expect(agentRows[0].textContent).toContain(
      'The stdout reply is still the visible answer, and it appears in the correct turn.',
    );
    expect(agentRows[0].textContent).toContain('Its second line is preserved in that same turn.');
    expect(agentRows[0].textContent).not.toContain('OpenAI Codex v0.144.1');
    expect(agentRows[0].textContent).not.toContain('export function projectConversation');
    expect(agentRows[0].querySelectorAll('.msg__body li')).toHaveLength(0);
  });

  it('renders unknown CLI frames as distinct protocol-drift rows with a trace action', async () => {
    const unknown: SystemUnknownFrameEvent = {
      id: 'unknown-frame-1',
      kind: 'system.unknownFrame',
      timestamp: nextTs(),
      severity: 'warn',
      frameKind: 'item.completed/future_tool_payload',
      cli: 'codex',
      cliVersion: '0.147.0',
      transport: 'jsonl',
      message: 'Unknown frame (kind item.completed/future_tool_payload, cli codex v0.147.0)',
      rawRange: RANGE,
    };
    const fixture = await render([unknown]);
    const row = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="conversation-unknown-frame"]',
    );
    const openedRanges: Array<RawLineRange | null> = [];
    fixture.componentInstance.openTrace.subscribe((range) => openedRanges.push(range));

    expect(row?.getAttribute('data-frame-kind')).toBe('item.completed/future_tool_payload');
    expect(row?.getAttribute('data-cli')).toBe('codex');
    expect(row?.getAttribute('data-cli-version')).toBe('0.147.0');
    expect(row?.textContent).toContain('Protocol drift');
    expect(row?.textContent).toContain('cli codex v0.147.0');
    row
      ?.querySelector<HTMLButtonElement>('[data-testid="conversation-unknown-frame-open-trace"]')
      ?.click();
    expect(openedRanges).toEqual([RANGE]);
  });

  it('shows the empty state when there are no events', async () => {
    const fixture = await render([]);
    const el: HTMLElement = fixture.nativeElement;

    const empty = el.querySelector('[data-testid="conversation-empty"]');
    expect(empty).toBeTruthy();
    expect(empty?.textContent).toContain('No conversation yet');
    expect(el.querySelector('[data-testid="conversation-feed"]')).toBeNull();

    // isRunning switches the copy to the waiting variant.
    fixture.componentRef.setInput('isRunning', true);
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="conversation-empty"]')?.textContent).toContain(
      'Waiting for the agent',
    );
  });

  it('renders a user bubble and folds consecutive agent messages into one group', async () => {
    const fixture = await render([
      msg('message.user', 'Please add a feature flag.'),
      msg('message.taskAgent', 'Starting on the flag now.'),
      msg('message.taskAgent', 'Flag added, wiring the projection next.'),
    ]);
    const el: HTMLElement = fixture.nativeElement;

    const userRow = el.querySelector('[data-actor="message.user"]');
    expect(userRow).toBeTruthy();
    expect(userRow?.getAttribute('data-item-count')).toBe('1');
    expect(userRow?.querySelector('.msg__actor')?.textContent).toBe('You');
    expect(userRow?.textContent).toContain('Please add a feature flag.');

    const agentRows = el.querySelectorAll('[data-actor="message.taskAgent"]');
    expect(agentRows.length).toBe(1);
    const agentRow = agentRows[0];
    expect(agentRow.getAttribute('data-item-count')).toBe('2');
    expect(agentRow.querySelector('.msg__actor')?.textContent).toBe('Agent');
    expect(
      agentRow.querySelector('[data-testid="conversation-message-count"]')?.textContent,
    ).toContain('2 events');
    expect(agentRow.textContent).toContain('Starting on the flag now.');
    expect(agentRow.textContent).toContain('Flag added, wiring the projection next.');
  });

  it('renders typed raw file payloads without passing them through Markdown', async () => {
    const html = '<!doctype html><html><body><ul><li>literal source</li></ul></body></html>';
    const fixture = await render([
      msg('message.taskAgent', html, {
        content: [{ type: 'html-file', text: html, mediaType: 'text/html' }],
      }),
    ]);
    const host = fixture.nativeElement as HTMLElement;
    const raw = host.querySelector<HTMLElement>('[data-payload-type="html-file"]');

    expect(raw?.tagName).toBe('PRE');
    expect(raw?.textContent).toBe(html);
    expect(host.querySelector('[data-payload-type="html-file"] ul')).toBeNull();
    expect(host.querySelector('[data-payload-type="html-file"] cac-markdown')).toBeNull();
  });

  it('renders typed diffs and csharp blocks with the shared syntax highlighter', async () => {
    const diff = [
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');
    const csharp = 'public class Foo\n{\n    public int X { get; set; }\n}';
    const fixture = await render([
      msg('message.taskAgent', diff, {
        content: [{ type: 'diff', text: diff, format: 'git' }],
      }),
      msg('message.taskAgent', csharp, {
        content: [{ type: 'code-block', text: csharp, language: 'csharp' }],
      }),
    ]);
    const host = fixture.nativeElement as HTMLElement;
    const diffPayload = host.querySelector<HTMLElement>('[data-payload-type="diff"]');
    const codePayload = host.querySelector<HTMLElement>('[data-payload-type="code-block"]');

    expect(diffPayload?.querySelector('.hljs-addition')?.textContent).toBe('+new');
    expect(diffPayload?.querySelector('.hljs-deletion')?.textContent).toBe('-old');
    expect(diffPayload?.querySelector('.hljs-meta')?.textContent).toContain('@@ -1 +1 @@');
    expect(codePayload?.classList.contains('md-code--hl')).toBe(true);
    expect(codePayload?.querySelector('.hljs-keyword')?.textContent).toBe('public');
    expect(codePayload?.querySelector('[class*="hljs-"]')).toBeTruthy();
  });

  it('keeps structured board summaries and moderate messages fully visible', async () => {
    const boardSummary = [
      '## Board summary',
      '- Ready: 3',
      '- In progress: 2',
      '- Review: 1',
      '- Blocked: 0',
      '- Done today: 4',
    ].join('\n');
    const moderateLines = Array.from({ length: 40 }, (_, index) => `complete line ${index + 1}`);
    const fixture = await render([
      msg('message.taskAgent', 'Short answer.'),
      msg('message.orchestrator', boardSummary, { id: 'board-summary' }),
      msg('message.taskAgent', moderateLines.join('\n'), { id: 'at-line-limit' }),
    ]);
    const el: HTMLElement = fixture.nativeElement;
    const summary = el.querySelector<HTMLElement>('[data-item-id="board-summary"]');
    const moderate = el.querySelector<HTMLElement>('[data-item-id="at-line-limit"]');

    expect(summary?.textContent).toContain('Done today: 4');
    expect(summary?.getAttribute('data-collapsed')).toBe('false');
    expect(summary?.querySelector('[data-testid="conversation-message-item-expand"]')).toBeNull();
    expect(moderate?.textContent).toContain('complete line 40');
    expect(moderate?.getAttribute('data-collapsed')).toBe('false');
    expect(moderate?.querySelector('[data-testid="conversation-message-item-expand"]')).toBeNull();
  });

  it('collapses long diffs and remembers expansion by message id for the session', async () => {
    const longDiff = [
      '```diff',
      ...Array.from({ length: 41 }, (_, index) => `+ changed line ${index + 1}`),
      '```',
    ].join('\n');
    const event = msg('message.orchestrator', longDiff, { id: 'long-diff' });
    const fixture = await render([event]);
    const el: HTMLElement = fixture.nativeElement;
    const item = el.querySelector<HTMLElement>('[data-item-id="long-diff"]');
    const toggle = item?.querySelector<HTMLButtonElement>(
      '[data-testid="conversation-message-item-expand"]',
    );

    expect(item?.getAttribute('data-collapsed')).toBe('true');
    expect(toggle?.textContent?.trim()).toBe('expand');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');

    toggle?.click();
    fixture.detectChanges();

    expect(item?.getAttribute('data-collapsed')).toBe('false');
    expect(toggle?.textContent?.trim()).toBe('collapse');
    expect(
      JSON.parse(sessionStorage.getItem('coding-agent-chat.expanded-message-ids') ?? '[]'),
    ).toContain('long-diff');

    fixture.destroy();
    const remounted = await render([event]);
    const remembered = (remounted.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-item-id="long-diff"]',
    );
    expect(remembered?.getAttribute('data-collapsed')).toBe('false');
    expect(
      remembered
        ?.querySelector('[data-testid="conversation-message-item-expand"]')
        ?.textContent?.trim(),
    ).toBe('collapse');
  });

  it('collapses only after the character threshold and never collapses user messages', async () => {
    const fixture = await render([
      msg('message.orchestrator', 'x'.repeat(3000), { id: 'at-char-limit' }),
      msg('message.orchestrator', 'x'.repeat(3001), { id: 'over-char-limit' }),
      msg('message.user', 'x'.repeat(3001), { id: 'long-user-message' }),
    ]);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-item-id="at-char-limit"]')?.getAttribute('data-collapsed')).toBe(
      'false',
    );
    expect(
      el.querySelector('[data-item-id="over-char-limit"]')?.getAttribute('data-collapsed'),
    ).toBe('true');
    expect(
      el.querySelector('[data-item-id="long-user-message"]')?.getAttribute('data-collapsed'),
    ).toBe('false');
  });

  it('renders a tool burst between agent turns, keeps the role continuous, and hides bursts when toolsVisible is false', async () => {
    const fixture = await render([
      msg('message.taskAgent', 'Reading the sources.'),
      burst(),
      msg('message.taskAgent', 'Done reading, editing now.'),
    ]);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-testid="conversation-tool-burst"]')).toBeTruthy();
    expect(el.querySelector('cac-tool-burst-chip')).toBeTruthy();

    // The burst preserves the surrounding role: the second agent group renders
    // as a continued bubble without repeating the actor header.
    const agentRows = el.querySelectorAll('[data-actor="message.taskAgent"]');
    expect(agentRows.length).toBe(2);
    expect(agentRows[0].getAttribute('data-show-header')).toBe('true');
    expect(agentRows[1].getAttribute('data-show-header')).toBe('false');

    fixture.componentRef.setInput('toolsVisible', false);
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="conversation-tool-burst"]')).toBeNull();
  });

  it('renders structured Codex work as one collapsed phase plus one living checklist', async () => {
    const events = projectConversation({
      source: 'codex-work-phase',
      lines: codexStructuredWorkPhaseFragment(),
    });
    const fixture = await render(events);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('[data-testid="conversation-work-phase"]')).toHaveLength(1);
    expect(el.querySelectorAll('[data-testid="conversation-plan-update"]')).toHaveLength(1);
    expect(el.querySelectorAll('[data-testid="conversation-system-status"]')).toHaveLength(0);
    expect(el.querySelectorAll('[data-testid="conversation-runtime-notice"]')).toHaveLength(0);

    const phase = el.querySelector<HTMLElement>('[data-testid="conversation-work-phase"]');
    expect(phase?.textContent).toContain('3 tool calls');
    expect(phase?.textContent).toContain('1 failed');
    expect(phase?.textContent).toContain('2 files touched');
    expect(phase?.querySelector('[data-testid="tool-burst-details"]')).toBeNull();

    const plan = el.querySelector<HTMLElement>('[data-testid="conversation-plan-update"]');
    expect(plan?.querySelectorAll('[data-testid="plan-item"]')).toHaveLength(2);
    expect(plan?.querySelector('[data-testid="plan-progress"]')?.textContent?.trim()).toBe('2/2');
  });

  it('renders an orphan runtime notice as one compact line with a Trace action', async () => {
    const events = projectConversation({
      source: 'orphan-file-change',
      lines: [
        {
          timestamp: nextTs(),
          stream: 'stdout',
          text: '{"type":"item.completed","item":{"id":"files_1","type":"file_change","changes":[{"path":"src/app.ts","kind":"update"}],"status":"completed"}}',
        },
      ],
    });
    const fixture = await render(events);
    const el = fixture.nativeElement as HTMLElement;
    const emitted: Array<RawLineRange | null> = [];
    fixture.componentInstance.openTrace.subscribe((range) => emitted.push(range));

    const notice = el.querySelector<HTMLElement>('[data-testid="conversation-runtime-notice"]');
    expect(notice?.textContent).toContain('File change');
    expect(notice?.textContent).toContain('1 file touched');
    expect(notice?.textContent).not.toContain('item.completed');
    notice
      ?.querySelector<HTMLButtonElement>('[data-testid="conversation-runtime-open-trace"]')
      ?.click();
    expect(emitted).toEqual([{ source: 'orphan-file-change', start: 1, end: 1 }]);
  });

  it('coalesces plan snapshots into a single latest checklist row', async () => {
    const fixture = await render([
      msg('message.user', 'build the tool'),
      planUpdate([
        { id: 'a', title: 'One', status: 'in_progress' },
        { id: 'b', title: 'Two', status: 'pending' },
      ]),
      burst(),
      planUpdate([
        { id: 'a', title: 'One', status: 'completed' },
        { id: 'b', title: 'Two', status: 'in_progress' },
      ]),
    ]);
    const el: HTMLElement = fixture.nativeElement;

    // Both snapshots share a run → only the newest renders, in place.
    const planRows = el.querySelectorAll('[data-testid="conversation-plan-update"]');
    expect(planRows).toHaveLength(1);
    const items = planRows[0].querySelectorAll('[data-testid="plan-item"]');
    expect(items[0].getAttribute('data-status')).toBe('completed');
    expect(items[1].getAttribute('data-status')).toBe('in_progress');
    expect(planRows[0].querySelector('[data-testid="plan-progress"]')?.textContent?.trim()).toBe(
      '1/2',
    );
  });

  it('filters runMarker start rows but seeds the session id, and renders terminal run markers', async () => {
    seq += 1;
    const start: RunMarkerEvent = {
      id: `run-${seq}`,
      kind: 'runMarker',
      timestamp: nextTs(),
      marker: 'start',
      sessionId: 'abcd1234-5678-uuid',
      rawRange: RANGE,
    };
    seq += 1;
    const complete: RunMarkerEvent = {
      id: `run-${seq}`,
      kind: 'runMarker',
      timestamp: nextTs(),
      marker: 'complete',
      runId: 4,
      cli: 'claude',
      model: 'claude-opus-4-7',
      thinkingLevel: 'xhigh',
      rawRange: RANGE,
    };
    const fixture = await render([start, msg('message.taskAgent', 'Working.'), complete]);
    const el: HTMLElement = fixture.nativeElement;

    // Exactly one visible marker row: `start` is filtered out.
    const markers = el.querySelectorAll('[data-testid="conversation-run-marker"]');
    expect(markers.length).toBe(1);
    expect(markers[0].getAttribute('data-marker')).toBe('complete');
    expect(markers[0].textContent).toContain('Run 4 · complete');
    const indicator = markers[0].querySelector('[data-testid="conversation-run-model"]');
    expect(indicator?.textContent?.replace(/\s/g, '')).toBe('CLDXH');
    expect(indicator?.querySelector('.model-level')?.getAttribute('title')).toBe(
      'claude-opus-4-7, thinking xhigh',
    );

    // The start marker's session id lands on the following message group.
    const agentRow = el.querySelector('[data-actor="message.taskAgent"]');
    expect(agentRow?.getAttribute('data-session-id')).toBe('abcd1234-5678-uuid');
    expect(
      agentRow?.querySelector('[data-testid="conversation-message-session"]')?.textContent,
    ).toContain('abcd1234…');
  });

  it('renders orchestrator decisions with a mapped label and emits openTrace from the trace button', async () => {
    seq += 1;
    const decision: OrchestratorDecisionEvent = {
      id: `dec-${seq}`,
      kind: 'decision.orchestrator',
      timestamp: nextTs(),
      decisionType: 'reissue-open-items',
      reason: 'evidence was incomplete',
      action: 'reissue',
      retryBudget: { used: 1, max: 3 },
      rawRange: { source: 'cli-output.log', start: 40, end: 44 },
    };
    const fixture = await render([decision]);
    const el: HTMLElement = fixture.nativeElement;

    const row = el.querySelector('[data-testid="conversation-decision-orchestrator"]');
    expect(row).toBeTruthy();
    expect(row?.getAttribute('data-decision-type')).toBe('reissue-open-items');
    expect(row?.querySelector('[data-testid="conversation-decision-type"]')?.textContent).toBe(
      'Reissue · Open items',
    );
    expect(row?.textContent).toContain('evidence was incomplete');
    expect(row?.textContent).toContain('retry 1/3');

    // Unknown decision types title-case instead of falling over.
    expect(fixture.componentInstance.decisionTypeLabel('budget-guard')).toBe('Budget Guard');

    const emitted: (RawLineRange | null)[] = [];
    fixture.componentInstance.openTrace.subscribe((range) => emitted.push(range));
    row
      ?.querySelector<HTMLButtonElement>('[data-testid="conversation-decision-open-trace"]')
      ?.click();
    expect(emitted).toEqual([{ source: 'cli-output.log', start: 40, end: 44 }]);
  });

  it('groups only contiguous non-terminal supervisor waits', async () => {
    const fixture = await render([
      supervisorWait('quiet', 30),
      supervisorWait('quiet', 60),
      msg('message.taskAgent', 'Output resumed between watchdog sequences.'),
      supervisorWait('resumed', 0),
      supervisorWait('quiet', 45),
    ]);
    const el = fixture.nativeElement as HTMLElement;
    const groups = el.querySelectorAll<HTMLElement>(
      '[data-testid="conversation-supervisor-wait-group"]',
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].getAttribute('data-item-count')).toBe('2');
    expect(groups[0].textContent).toContain('2 quiet · 0 resumed');
    expect(groups[1].getAttribute('data-item-count')).toBe('2');
    expect(groups[1].textContent).toContain('1 quiet · 1 resumed');
    expect(fixture.componentInstance.rows().map((row) => row.kind)).toEqual([
      'supervisorWaitGroup',
      'messageGroup',
      'supervisorWaitGroup',
    ]);
  });

  it('ends a wait group at a non-rendered non-supervisor event', async () => {
    const fixture = await render([
      supervisorWait('quiet', 30),
      {
        id: `summary-${seq}`,
        kind: 'workbench.summary',
        timestamp: nextTs(),
        rawRange: RANGE,
        headline: 'Host-side summary row',
      },
      supervisorWait('quiet', 60),
    ]);
    const groups = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      '[data-testid="conversation-supervisor-wait-group"]',
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].getAttribute('data-item-count')).toBe('1');
    expect(groups[1].getAttribute('data-item-count')).toBe('1');
    expect(fixture.componentInstance.rows().map((row) => row.kind)).toEqual([
      'supervisorWaitGroup',
      'supervisorWaitGroup',
    ]);
  });

  it('keeps killed watchdog events out of adjacent wait groups', async () => {
    const fixture = await render([
      supervisorWait('quiet', 120),
      supervisorWait('killed', 600, {
        severity: 'error',
        budgetSeconds: 600,
        reason: '[watchdog] Killed after 600s of silence',
      }),
      supervisorWait('quiet', 30),
    ]);
    const el = fixture.nativeElement as HTMLElement;
    const groups = el.querySelectorAll<HTMLElement>(
      '[data-testid="conversation-supervisor-wait-group"]',
    );
    const killed = el.querySelector<HTMLElement>('[data-testid="conversation-supervisor-wait"]');

    expect(groups).toHaveLength(2);
    expect(groups[0].getAttribute('data-item-count')).toBe('1');
    expect(groups[0].textContent).toContain('max 120 / 600s');
    expect(groups[1].getAttribute('data-item-count')).toBe('1');
    expect(killed?.getAttribute('data-state')).toBe('killed');
    expect(killed?.getAttribute('role')).toBe('alert');
    expect(killed?.textContent).toContain('Killed after 600s of silence');
    expect(fixture.componentInstance.rows().map((row) => row.kind)).toEqual([
      'supervisorWaitGroup',
      'supervisorWait',
      'supervisorWaitGroup',
    ]);
  });

  it('keeps watchdog timeouts out of wait groups', async () => {
    const fixture = await render([
      supervisorWait('quiet', 120),
      supervisorWait('quiet', 600, {
        budgetSeconds: 600,
        reason: '[watchdog] Silence timeout after 600s',
      }),
      supervisorWait('resumed', 0),
    ]);
    const el = fixture.nativeElement as HTMLElement;
    const groups = el.querySelectorAll<HTMLElement>(
      '[data-testid="conversation-supervisor-wait-group"]',
    );
    const timeout = el.querySelector<HTMLElement>('[data-testid="conversation-supervisor-wait"]');

    expect(groups).toHaveLength(2);
    expect(groups[0].getAttribute('data-item-count')).toBe('1');
    expect(groups[1].getAttribute('data-item-count')).toBe('1');
    expect(timeout?.getAttribute('data-state')).toBe('timeout');
    expect(timeout?.getAttribute('role')).toBe('alert');
    expect(timeout?.textContent).toContain('Silence timeout after 600s');
  });

  it('starts wait groups collapsed and reveals every event when toggled', async () => {
    const fixture = await render([
      supervisorWait('quiet', 30, { budgetSeconds: 600, reason: '[watchdog] Quiet for 30s' }),
      supervisorWait('quiet', 60, { budgetSeconds: 600, reason: '[watchdog] Still silent at 60s' }),
      supervisorWait('quiet', 90, { budgetSeconds: 600, reason: '[watchdog] Still silent at 90s' }),
      supervisorWait('quiet', 120, {
        budgetSeconds: 600,
        reason: '[watchdog] Still silent at 120s',
      }),
      supervisorWait('quiet', 120, {
        budgetSeconds: 600,
        reason: '[watchdog] Waiting within budget',
      }),
      supervisorWait('resumed', 0, {
        budgetSeconds: 600,
        reason: '[watchdog] Agent resumed streaming',
      }),
    ]);
    const el = fixture.nativeElement as HTMLElement;
    const group = el.querySelector<HTMLElement>(
      '[data-testid="conversation-supervisor-wait-group"]',
    );
    const toggle = group?.querySelector<HTMLButtonElement>(
      '[data-testid="conversation-supervisor-wait-toggle"]',
    );

    expect(group?.getAttribute('data-item-count')).toBe('6');
    expect(group?.getAttribute('data-expanded')).toBe('false');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('[data-testid="conversation-supervisor-wait-events"]')).toBeNull();

    toggle?.click();
    fixture.detectChanges();

    expect(group?.getAttribute('data-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    const events = el.querySelectorAll<HTMLElement>(
      '[data-testid="conversation-supervisor-wait-event"]',
    );
    expect(events).toHaveLength(6);
    expect(events[0].textContent).toContain('Quiet for 30s');
    expect(events[5].getAttribute('data-state')).toBe('resumed');
    expect(events[5].textContent).toContain('Agent resumed streaming');

    toggle?.click();
    fixture.detectChanges();
    expect(group?.getAttribute('data-expanded')).toBe('false');
    expect(el.querySelector('[data-testid="conversation-supervisor-wait-events"]')).toBeNull();
  });

  it('renders image events with caption, preferring the durable path over the source path', async () => {
    seq += 1;
    const durable: ArtifactImageEvent = {
      id: `img-${seq}`,
      kind: 'artifact.image',
      timestamp: nextTs(),
      caption: 'Empty state screenshot',
      sourcePath: '/tmp/shot-01.png',
      durablePath: 'results/01-empty-state.png',
      rawRange: RANGE,
    };
    seq += 1;
    const scratchOnly: ArtifactImageEvent = {
      id: `img-${seq}`,
      kind: 'artifact.image',
      timestamp: nextTs(),
      caption: 'Uncurated screenshot',
      sourcePath: '/tmp/shot-02.png',
      durablePath: null,
      rawRange: RANGE,
    };
    const fixture = await render([durable, scratchOnly]);
    const el: HTMLElement = fixture.nativeElement;

    const rows = el.querySelectorAll('[data-testid="conversation-artifact-image"]');
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('figcaption')?.textContent).toBe('Empty state screenshot');
    expect(rows[0].querySelector('.image__path')?.textContent).toBe('results/01-empty-state.png');
    // No durable copy yet: falls back to the scratch source path.
    expect(rows[1].querySelector('.image__path')?.textContent).toBe('/tmp/shot-02.png');
  });

  it('renders the actual image (not just the path) when the event carries a url', async () => {
    seq += 1;
    const withUrl: ArtifactImageEvent = {
      id: `img-${seq}`,
      kind: 'artifact.image',
      timestamp: nextTs(),
      caption: 'Dashboard',
      url: 'data:image/png;base64,iVBORw0KGgo=',
      sourcePath: '/tmp/dash.png',
      rawRange: RANGE,
    };
    const fixture = await render([withUrl]);
    const el: HTMLElement = fixture.nativeElement;

    const img = el.querySelector<HTMLImageElement>(
      '[data-testid="conversation-artifact-image-img"]',
    );
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toContain('data:image/png');
    expect(img?.getAttribute('alt')).toBe('Dashboard');
    // The path-only fallback is not used when the image renders.
    expect(el.querySelector('.image__path')).toBeNull();
  });

  it('lifts a Session init lifecycle line into a session meta card instead of a bubble', async () => {
    const fixture = await render([
      msg('message.taskAgent', '● Session init 0a1b2c3d4e5f'),
      msg('message.taskAgent', 'Continuing after init.'),
    ]);
    const el: HTMLElement = fixture.nativeElement;

    const card = el.querySelector('[data-testid="conversation-session-meta"]');
    expect(card).toBeTruthy();
    expect(card?.querySelector('[data-testid="conversation-session-card-id"]')?.textContent).toBe(
      '0a1b2c3d…',
    );

    // The lifecycle line itself never renders as a message item.
    const agentRow = el.querySelector('[data-actor="message.taskAgent"]');
    expect(agentRow?.getAttribute('data-item-count')).toBe('1');
    expect(agentRow?.textContent).not.toContain('Session init');
    expect(agentRow?.textContent).toContain('Continuing after init.');
    // The bubble header carries the lifted session id.
    expect(agentRow?.getAttribute('data-session-id')).toBe('0a1b2c3d4e5f');
  });

  describe('virtualisation', () => {
    // Alternating user/agent turns produce one row each (a user turn closes
    // the agent group), so N pairs → 2N distinct rows to window over.
    function manyRows(pairs: number): ConversationEvent[] {
      const events: ConversationEvent[] = [];
      for (let i = 0; i < pairs; i++) {
        events.push(msg('message.user', `Question ${i}`));
        events.push(msg('message.taskAgent', `Answer ${i}`));
      }
      return events;
    }

    it('renders every row and no spacers when virtualised is off (default)', async () => {
      const fixture = await render(manyRows(40)); // 80 rows
      const el: HTMLElement = fixture.nativeElement;
      const c = fixture.componentInstance;

      expect(c.rows().length).toBe(80);
      expect(c.windowedRows().length).toBe(80);
      expect(c.topSpacerPx()).toBe(0);
      expect(c.bottomSpacerPx()).toBe(0);
      expect(el.querySelector('[data-testid="conversation-spacer-top"]')).toBeNull();
      expect(el.querySelector('[data-testid="conversation-spacer-bottom"]')).toBeNull();
      expect(el.querySelector('.conv--virtualised')).toBeNull();
    });

    it('windows the feed and holds scroll height with a top spacer when virtualised', async () => {
      const fixture = await render(manyRows(40), { virtualised: true }); // 80 rows
      const el: HTMLElement = fixture.nativeElement;
      const c = fixture.componentInstance;

      expect(c.rows().length).toBe(80);
      // Stuck-to-bottom by default → the window pins to the tail (~50 rows).
      expect(c.windowedRows().length).toBeLessThan(c.rows().length);
      expect(c.windowedRows().length).toBeGreaterThanOrEqual(50);
      expect(c.visibleStart()).toBeGreaterThan(0);
      // The rows above the window are held by a top spacer, none below the tail.
      expect(c.topSpacerPx()).toBe(c.visibleStart() * c.virtualRowHeightPx());
      expect(c.bottomSpacerPx()).toBe(0);

      const topSpacer = el.querySelector<HTMLElement>('[data-testid="conversation-spacer-top"]');
      expect(topSpacer).toBeTruthy();
      expect(topSpacer!.style.height).toBe(`${c.topSpacerPx()}px`);
      // The view owns its scroll container in virtualised mode.
      expect(el.querySelector('.conv--virtualised')).toBeTruthy();
      // The tail row is in the window (the newest answer is rendered).
      expect(el.querySelector('[data-testid="conversation-feed"]')?.textContent).toContain(
        'Answer 39',
      );
    });

    it('leaves the window at the full list when it fits (small N)', async () => {
      const fixture = await render(manyRows(5), { virtualised: true }); // 10 rows
      const c = fixture.componentInstance;
      expect(c.rows().length).toBe(10);
      expect(c.windowedRows().length).toBe(10);
      expect(c.topSpacerPx()).toBe(0);
      expect(c.bottomSpacerPx()).toBe(0);
    });

    it('re-slices the virtual feed to its tail when Jump to latest is clicked', async () => {
      const fixture = await render(manyRows(40), { virtualised: true }); // 80 rows
      const el: HTMLElement = fixture.nativeElement;
      const c = fixture.componentInstance;
      const root = el.querySelector<HTMLElement>('[data-testid="conversation-view"]')!;
      const state = { scrollHeight: 9600, clientHeight: 600, scrollTop: 0 };
      Object.defineProperties(root, {
        scrollHeight: { configurable: true, get: () => state.scrollHeight },
        clientHeight: { configurable: true, get: () => state.clientHeight },
        scrollTop: {
          configurable: true,
          get: () => state.scrollTop,
          set: (value: number) => {
            state.scrollTop = value;
          },
        },
      });
      c.visibleStart.set(0);
      c.visibleEnd.set(25);
      const stick = fixture.debugElement
        .query(By.css('.conv'))
        .injector.get(StickToBottomDirective);
      (stick as unknown as { _stuck: { set(value: boolean): void } })._stuck.set(false);
      fixture.detectChanges();
      vi.spyOn(stick, 'scrollToBottom').mockImplementation(() => {
        state.scrollTop = state.scrollHeight - state.clientHeight;
      });

      const jumpButton = el.querySelector<HTMLButtonElement>(
        '[data-testid="conversation-jump-latest"]',
      );
      expect(jumpButton).toBeTruthy();
      jumpButton!.click();

      expect(stick.scrollToBottom).toHaveBeenCalledOnce();
      expect(c.visibleEnd()).toBe(c.rows().length);
      expect(c.visibleStart()).toBeGreaterThan(0);
      expect(c.bottomSpacerPx()).toBe(0);
    });
  });
});
