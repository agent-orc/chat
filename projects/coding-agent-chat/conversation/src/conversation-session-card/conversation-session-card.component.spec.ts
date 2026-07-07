// Covers the SessionCardData variants of the session meta card: minimal data,
// session id + init time, a fully parsed rate-limit line (window/status/reset),
// and the reset-hint fallback when no structured resetsAt is present.

import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import { parseRateLimit, type SessionCardData } from 'coding-agent-chat/core';

import { ConversationSessionCardComponent } from './conversation-session-card.component';

async function render(
  data: SessionCardData,
): Promise<ComponentFixture<ConversationSessionCardComponent>> {
  const fixture = TestBed.createComponent(ConversationSessionCardComponent);
  fixture.componentRef.setInput('data', data);
  await fixture.whenStable();
  return fixture;
}

describe('ConversationSessionCardComponent', () => {
  it('renders only the Session label for minimal data', async () => {
    const fixture = await render({});
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-testid="conversation-session-card"]')).toBeTruthy();
    expect(el.textContent).toContain('Session');
    expect(el.querySelector('[data-testid="conversation-session-card-id"]')).toBeNull();
    expect(el.querySelector('[data-testid="conversation-session-card-ratelimit"]')).toBeNull();
    expect(el.querySelector('.scard__init')).toBeNull();
  });

  it('renders the short session id and the init clock when provided', async () => {
    const fixture = await render({
      sessionIdFull: '0a1b2c3d-4e5f-6789-abcd-ef0123456789',
      sessionIdShort: '0a1b2c3d…',
      initAt: '2026-05-05T12:00:00.000Z',
    });
    const el: HTMLElement = fixture.nativeElement;

    expect(
      el.querySelector('[data-testid="conversation-session-card-id"]')?.textContent,
    ).toBe('0a1b2c3d…');
    const init = el.querySelector('.scard__init');
    expect(init?.textContent).toContain('started');
    // The clock itself is locale-formatted; assert it resolved to something.
    expect(init?.textContent?.trim().length).toBeGreaterThan('started'.length);
  });

  it('renders the rate-limit pill with window label, status, and a reset clock', async () => {
    const rateLimit = parseRateLimit(
      '● Rate limit · five-hour · allowed · reset in 4.4 h  ' +
        '[window=five_hour status=allowed resetsAt=1777393800 overage=allowed usingOverage=false]',
    );
    const fixture = await render({ sessionIdShort: '0a1b2c3d…', rateLimit });
    const el: HTMLElement = fixture.nativeElement;

    const pill = el.querySelector('[data-testid="conversation-session-card-ratelimit"]');
    expect(pill).toBeTruthy();
    expect(pill?.getAttribute('data-status')).toBe('allowed');
    expect(pill?.querySelector('.scard__rate-window')?.textContent?.trim()).toBe('5h');
    expect(pill?.querySelector('.scard__rate-status')?.textContent?.trim()).toBe('allowed');
    // resetsAt was structured, so the reset clock renders (locale-formatted time).
    const reset = pill?.querySelector('.scard__rate-reset');
    expect(reset?.textContent).toContain('resets');
    expect(reset?.textContent?.replace('resets', '').trim().length).toBeGreaterThan(0);
  });

  it('falls back to the human reset hint when the line has no structured resetsAt', async () => {
    const rateLimit = parseRateLimit('● Rate limit · reset in 12 m');
    const fixture = await render({ rateLimit });
    const el: HTMLElement = fixture.nativeElement;

    const pill = el.querySelector('[data-testid="conversation-session-card-ratelimit"]');
    expect(pill).toBeTruthy();
    // No window/status tokens on this line: those spans stay hidden.
    expect(pill?.querySelector('.scard__rate-window')).toBeNull();
    expect(pill?.querySelector('.scard__rate-status')).toBeNull();
    expect(pill?.querySelector('.scard__rate-reset')?.textContent).toContain('reset in 12 m');
  });
});
