/**
 * Specs for the workforce role badge: pre-resolved id + author fallback
 * (smoke), compact mode, refs-based resolution, and roleId precedence.
 */
import { TestBed } from '@angular/core/testing';

import { RoleBadgeComponent } from './role-badge.component';

describe('RoleBadgeComponent (TestBed smoke)', () => {
  it('renders the resolved role for a pre-resolved id', async () => {
    const fixture = TestBed.createComponent(RoleBadgeComponent);
    fixture.componentRef.setInput('roleId', 'implementer');
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('falls back to author/kind resolution when no id is set', async () => {
    const fixture = TestBed.createComponent(RoleBadgeComponent);
    fixture.componentRef.setInput('author', 'Claude Code');
    await fixture.whenStable();

    expect(fixture.componentInstance.role()).toBeTruthy();
  });
});

describe('RoleBadgeComponent (compact mode)', () => {
  it('adds the compact modifier class and keeps the glyph when compact is on', async () => {
    const fixture = TestBed.createComponent(RoleBadgeComponent);
    fixture.componentRef.setInput('roleId', 'code-reviewer');
    fixture.componentRef.setInput('compact', true);
    await fixture.whenStable();

    const badge = (fixture.nativeElement as HTMLElement).querySelector('.role-badge')!;
    expect(badge.classList.contains('role-badge--compact')).toBe(true);
    expect(badge.querySelector('.role-badge__glyph')?.textContent?.trim()).toBe('CR');
  });

  it('renders without the compact modifier by default', async () => {
    const fixture = TestBed.createComponent(RoleBadgeComponent);
    fixture.componentRef.setInput('roleId', 'code-reviewer');
    await fixture.whenStable();

    const badge = (fixture.nativeElement as HTMLElement).querySelector('.role-badge')!;
    expect(badge.classList.contains('role-badge--compact')).toBe(false);
    expect(badge.querySelector('.role-badge__label')?.textContent?.trim()).toBe('Code Reviewer');
  });
});

describe('RoleBadgeComponent (refs-based resolution)', () => {
  it('resolves an aspect ref to its mapped workforce role', async () => {
    const fixture = TestBed.createComponent(RoleBadgeComponent);
    fixture.componentRef.setInput('refs', ['aspect:tests-and-evidence']);
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(fixture.componentInstance.role().id).toBe('test-author');
    expect(el.querySelector('[data-testid="role-badge-test-author"]')).toBeTruthy();
    expect(el.querySelector('.role-badge__label')?.textContent?.trim()).toBe('Test Author');
  });

  it('resolves an explicit role ref against the catalogue', async () => {
    const fixture = TestBed.createComponent(RoleBadgeComponent);
    fixture.componentRef.setInput('refs', ['role:security-auditor']);
    await fixture.whenStable();

    expect(fixture.componentInstance.role().id).toBe('security-auditor');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-role-id="security-auditor"]')
    ).toBeTruthy();
  });

  it('lets a pre-resolved roleId win over author and refs', async () => {
    const fixture = TestBed.createComponent(RoleBadgeComponent);
    fixture.componentRef.setInput('roleId', 'plan-curator');
    fixture.componentRef.setInput('author', 'user');
    fixture.componentRef.setInput('refs', ['aspect:code-quality']);
    await fixture.whenStable();

    expect(fixture.componentInstance.role().id).toBe('plan-curator');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.role-badge__label')?.textContent?.trim()
    ).toBe('Plan Curator');
  });
});
