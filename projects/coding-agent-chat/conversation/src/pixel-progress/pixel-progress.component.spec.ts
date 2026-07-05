// Covers the pixel-progress scene host: canvas presence, the data-state
// reflection, state flips, and clean destruction. The actual pixel painting
// is imperative canvas work that jsdom cannot execute (getContext returns
// null there) — the component must stay constructible and silent without it.

import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import { PixelProgressComponent } from './pixel-progress.component';

async function render(state: 'working' | 'queued'): Promise<ComponentFixture<PixelProgressComponent>> {
  const fixture = TestBed.createComponent(PixelProgressComponent);
  fixture.componentRef.setInput('state', state);
  await fixture.whenStable();
  return fixture;
}

describe('PixelProgressComponent', () => {
  it('renders the scene canvas, marked decorative, with the state reflected on the host', async () => {
    const fixture = await render('working');
    const host: HTMLElement = fixture.nativeElement;

    const canvas = host.querySelector('[data-testid="pixel-progress-canvas"]');
    expect(canvas).toBeTruthy();
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(host.getAttribute('data-state')).toBe('working');
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });

  it('reflects a state flip to queued on the host attribute', async () => {
    const fixture = await render('working');
    fixture.componentRef.setInput('state', 'queued');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).getAttribute('data-state')).toBe('queued');
  });

  it('destroys cleanly without a canvas 2D context (jsdom)', async () => {
    const fixture = await render('working');
    expect(() => fixture.destroy()).not.toThrow();
  });

  it('accepts model and thinking inputs without throwing', async () => {
    const fixture = await render('working');
    fixture.componentRef.setInput('model', 'claude-opus-4-8');
    fixture.componentRef.setInput('thinking', 'high');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-testid="pixel-progress-canvas"]')).toBeTruthy();
  });
});
