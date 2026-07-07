// Covers the ConversationView row builder + template over hand-built ConversationEvent
// fixtures: message grouping (user/agent), tool bursts + visibility toggle, run markers
// (start filtering, session-id seeding), orchestrator decisions, image events, the
// session-init meta card lift, and the empty-feed state.

import { TestBed } from '@angular/core/testing';

import type {
  ArtifactImageEvent,
  ConversationEvent,
  MessageEvent,
  OrchestratorDecisionEvent,
  PlanItem,
  PlanUpdateEvent,
  RawLineRange,
  RunMarkerEvent,
  ToolBurstEvent,
} from 'coding-agent-chat/core';

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

async function render(
  events: readonly ConversationEvent[],
  inputs: Record<string, unknown> = {},
) {
  const fixture = TestBed.createComponent(ConversationViewComponent);
  fixture.componentRef.setInput('events', events);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('ConversationViewComponent', () => {
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
    expect(
      el.querySelector('[data-testid="conversation-empty"]')?.textContent,
    ).toContain('Waiting for the agent');
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
    expect(planRows[0].querySelector('[data-testid="plan-progress"]')?.textContent?.trim()).toBe('1/2');
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
      rawRange: RANGE,
    };
    const fixture = await render([start, msg('message.taskAgent', 'Working.'), complete]);
    const el: HTMLElement = fixture.nativeElement;

    // Exactly one visible marker row: `start` is filtered out.
    const markers = el.querySelectorAll('[data-testid="conversation-run-marker"]');
    expect(markers.length).toBe(1);
    expect(markers[0].getAttribute('data-marker')).toBe('complete');
    expect(markers[0].textContent).toContain('Run 4 · complete');
    expect(markers[0].textContent).toContain('claude-opus-4-7');

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
    expect(
      row?.querySelector('[data-testid="conversation-decision-type"]')?.textContent,
    ).toBe('Reissue · Open items');
    expect(row?.textContent).toContain('evidence was incomplete');
    expect(row?.textContent).toContain('retry 1/3');

    // Unknown decision types title-case instead of falling over.
    expect(fixture.componentInstance.decisionTypeLabel('budget-guard')).toBe('Budget Guard');

    const emitted: (RawLineRange | null)[] = [];
    fixture.componentInstance.openTrace.subscribe((range) => emitted.push(range));
    (
      row?.querySelector<HTMLButtonElement>(
        '[data-testid="conversation-decision-open-trace"]',
      )
    )?.click();
    expect(emitted).toEqual([{ source: 'cli-output.log', start: 40, end: 44 }]);
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
    expect(rows[0].querySelector('.image__path')?.textContent).toBe(
      'results/01-empty-state.png',
    );
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

    const img = el.querySelector<HTMLImageElement>('[data-testid="conversation-artifact-image-img"]');
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
    expect(
      card?.querySelector('[data-testid="conversation-session-card-id"]')?.textContent,
    ).toBe('0a1b2c3d…');

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
      expect(el.querySelector('[data-testid="conversation-feed"]')?.textContent).toContain('Answer 39');
    });

    it('leaves the window at the full list when it fits (small N)', async () => {
      const fixture = await render(manyRows(5), { virtualised: true }); // 10 rows
      const c = fixture.componentInstance;
      expect(c.rows().length).toBe(10);
      expect(c.windowedRows().length).toBe(10);
      expect(c.topSpacerPx()).toBe(0);
      expect(c.bottomSpacerPx()).toBe(0);
    });
  });
});
