import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { LAB_SCENARIOS } from './lab-scenarios';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the playground title and its three library surfaces', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Conversation Lab');
    expect(compiled.querySelector('cac-conversation-view')).toBeTruthy();
    expect(compiled.querySelector('cac-chat')).toBeTruthy();
    expect(compiled.querySelector('cac-project-chat-list')).toBeTruthy();
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
});
