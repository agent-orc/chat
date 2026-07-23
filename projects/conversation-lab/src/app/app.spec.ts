import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { LAB_SCENARIOS } from './lab-scenarios';

describe('App', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.setAttribute('data-studio-theme', 'dark');
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the playground title and its single conversation surface', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Conversation Lab');
    expect(compiled.querySelector('cac-conversation-view')).toBeTruthy();
    expect(compiled.querySelector('cac-chat')).toBeTruthy();
    // The project-chat-history panel was retired — one view only.
    expect(compiled.querySelector('cac-project-chat-list')).toBeNull();
    expect(compiled.querySelector('[data-testid="lab-release"]')?.textContent).toContain(
      'coding-agent-chat@0.2.2'
    );
  });

  it('renders one chip per catalog scenario', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const chips = compiled.querySelectorAll('.lab-scenario-chip');
    expect(chips.length).toBe(LAB_SCENARIOS.length);
  });

  it('selecting a replay scenario shows the replay controls and projected events', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const chip = compiled.querySelector<HTMLButtonElement>('[data-testid="lab-scenario-happy-path"]');
    expect(chip).toBeTruthy();
    chip!.click();
    await fixture.whenStable();

    // Replay controls appear; the transcript is loaded instantly.
    expect(compiled.querySelector('[data-testid="lab-replay-stream"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="lab-replay-progress"]')?.textContent).toContain('/');
    // Live bar must stay hidden for replay scenarios.
    expect(compiled.querySelector('[data-testid="lab-live-start"]')).toBeNull();
  });

  it('selecting a live scenario shows the live bar with the preset prompt', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="lab-scenario-live-smoke"]')!.click();
    await fixture.whenStable();

    expect(compiled.querySelector('[data-testid="lab-live-start"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="lab-live-prompt"]')?.textContent).toContain('Begrüßung');
  });

  it('opens the trace drawer with the raw replay lines from the conversation Trace button', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="lab-scenario-happy-path"]')!.click();
    await fixture.whenStable();

    compiled.querySelector<HTMLButtonElement>('[data-testid="conversation-open-trace"]')!.click();
    await fixture.whenStable();

    expect(compiled.querySelector('[data-testid="lab-trace-panel"]')).toBeTruthy();
    // Replay scenarios list their CliOutputLines verbatim.
    const lines = compiled.querySelectorAll('[data-testid="lab-trace-lines"] .lab-trace__line');
    expect(lines.length).toBeGreaterThan(0);

    compiled.querySelector<HTMLButtonElement>('[data-testid="lab-trace-close"]')!.click();
    await fixture.whenStable();
    expect(compiled.querySelector('[data-testid="lab-trace-panel"]')).toBeNull();
  });

  it('renders the Codex stderr transcript scenario as one compact status row plus one stdout reply', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="lab-scenario-codex-stderr-transcript"]')!.click();
    await fixture.whenStable();

    const conversation = compiled.querySelector('cac-conversation-view');
    expect(conversation).toBeTruthy();
    expect(conversation?.querySelectorAll('[data-testid="conversation-system-status"]')).toHaveLength(1);
    expect(conversation?.querySelector('[data-testid="conversation-system-status"]')?.textContent).not.toContain('/**');

    const agentRows = conversation?.querySelectorAll('[data-actor="message.taskAgent"]');
    expect(agentRows).toHaveLength(1);
    expect(agentRows?.[0].textContent).toContain('The stdout reply is still the visible answer, and it appears in the correct turn.');
    expect(agentRows?.[0].textContent).toContain('Its second line is preserved in that same turn.');
    expect(agentRows?.[0].textContent).not.toContain('/**');
    expect(conversation?.querySelectorAll('cac-markdown li')).toHaveLength(0);

    compiled.querySelector<HTMLButtonElement>('[data-testid="conversation-open-trace"]')!.click();
    await fixture.whenStable();

    const traceLines = compiled.querySelectorAll('[data-testid="lab-trace-lines"] .lab-trace__line');
    const traceText = Array.from(traceLines).map((line) => line.textContent ?? '').join('\n');
    expect(traceText).toContain('export function projectConversation(): string {');
    expect(traceText).toContain('* 10,975 contiguous stderr lines');
    expect(compiled.querySelector('[data-testid="lab-trace-lines"] cac-markdown')).toBeNull();
  });

  it('explains the missing activity log when tracing a fixture scenario', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    // Default scenario is the events showcase — no raw lines behind it.
    compiled.querySelector<HTMLButtonElement>('[data-testid="conversation-open-trace"]')!.click();
    await fixture.whenStable();

    expect(compiled.querySelector('[data-testid="lab-trace-empty"]')).toBeTruthy();
  });

  it('applies ?scenario= and ?theme= deep links on startup', async () => {
    const originalUrl = window.location.href;
    window.history.replaceState(null, '', '/?scenario=happy-path&theme=light');
    try {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const compiled = fixture.nativeElement as HTMLElement;

      expect(compiled.querySelector('[data-testid="lab-replay-stream"]')).toBeTruthy();
      // Instant load: every scripted line is already shown (N/N, N > 0).
      const progress = compiled.querySelector('[data-testid="lab-replay-progress"]')?.textContent ?? '';
      const match = progress.match(/(\d+)\/(\d+)/);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(match![2]);
      expect(Number(match![1])).toBeGreaterThan(0);
      expect(document.documentElement.getAttribute('data-studio-theme')).toBe('light');
    } finally {
      window.history.replaceState(null, '', originalUrl);
      document.documentElement.setAttribute('data-studio-theme', 'dark');
    }
  });

  it('remembers the last theme and scenario across a reload (localStorage)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="lab-scenario-happy-path"]')!.click();
    compiled.querySelector<HTMLButtonElement>('[data-testid="lab-theme-toggle"]')!.click();
    await fixture.whenStable();

    // A fresh component instance stands in for F5: both settings restore.
    const reloaded = TestBed.createComponent(App);
    await reloaded.whenStable();
    const recompiled = reloaded.nativeElement as HTMLElement;

    expect(
      recompiled.querySelector('.lab-scenario-chip--active')?.textContent
    ).toContain('Happy Path');
    expect(recompiled.querySelector('[data-testid="lab-replay-stream"]')).toBeTruthy();
    expect(document.documentElement.getAttribute('data-studio-theme')).toBe('light');
  });
});
