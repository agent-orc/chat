import { TestBed } from '@angular/core/testing';

import { App } from './app';
import { appConfig } from './app.config';

describe('App (website)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: appConfig.providers,
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the hero, both library demos and the docs section', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('coding agents');
    expect(compiled.querySelector('cac-conversation-view')).toBeTruthy();
    expect(compiled.querySelector('cac-chat')).toBeTruthy();
    expect(compiled.querySelector('cac-project-chat-list')).toBeTruthy();
    expect(compiled.querySelector('#docs')).toBeTruthy();
    expect(compiled.querySelectorAll('site-code').length).toBeGreaterThan(5);
  });
});
