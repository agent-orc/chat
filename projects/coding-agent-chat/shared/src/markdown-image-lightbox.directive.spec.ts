// Covers MarkdownImageLightboxDirective: click/keyboard delegation opens the
// CHAT_MEDIA_LIGHTBOX gallery with all usable images and the activated index,
// unusable-src filtering, a11y marking, and the legacy results-wrapper path.

import { Component, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi, type Mock } from 'vitest';

import { MarkdownImageLightboxDirective } from './markdown-image-lightbox.directive';
import { CHAT_MEDIA_LIGHTBOX } from './media-lightbox.token';

@Component({
  standalone: true,
  imports: [MarkdownImageLightboxDirective],
  template: `
    <div cacMarkdownLightbox>
      <p>Some text</p>
      <img id="first" src="https://assets.test/a.png" alt="First shot" />
      <img id="second" src="https://assets.test/b.png" alt="Second shot" />
      <img id="broken" src="" />
      <img id="placeholder" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />
    </div>
  `,
})
class GalleryHostComponent {}

@Component({
  standalone: true,
  imports: [MarkdownImageLightboxDirective],
  template: `
    <div cacMarkdownLightbox>
      <button
        type="button"
        data-results-lightbox="https://assets.test/full.png"
        data-results-alt="Full resolution"
      >
        <img id="thumb" src="https://assets.test/thumb.png" alt="Thumb" />
      </button>
      <img id="plain" src="https://assets.test/plain.png" alt="Plain" />
    </div>
  `,
})
class LegacyHostComponent {}

describe('MarkdownImageLightboxDirective', () => {
  async function setup<T>(
    component: Type<T>
  ): Promise<{ root: HTMLElement; openGallery: Mock }> {
    const openGallery = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: CHAT_MEDIA_LIGHTBOX, useValue: { openGallery } }],
    });
    const fixture = TestBed.createComponent(component);
    await fixture.whenStable();
    return { root: fixture.nativeElement as HTMLElement, openGallery };
  }

  it('opens the gallery of all usable images at the clicked index', async () => {
    const { root, openGallery } = await setup(GalleryHostComponent);

    root
      .querySelector('#second')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(openGallery).toHaveBeenCalledTimes(1);
    expect(openGallery).toHaveBeenCalledWith({
      images: [
        { src: 'https://assets.test/a.png', alt: 'First shot' },
        { src: 'https://assets.test/b.png', alt: 'Second shot' },
      ],
      index: 1,
    });
  });

  it('ignores clicks on non-image content and on images without a usable src', async () => {
    const { root, openGallery } = await setup(GalleryHostComponent);

    root.querySelector('p')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    root
      .querySelector('#broken')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    root
      .querySelector('#placeholder')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(openGallery).not.toHaveBeenCalled();
  });

  it('opens the gallery via keyboard Enter on a focused image', async () => {
    const { root, openGallery } = await setup(GalleryHostComponent);

    root
      .querySelector('#first')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(openGallery).toHaveBeenCalledTimes(1);
    expect(openGallery).toHaveBeenCalledWith(
      expect.objectContaining({ index: 0 })
    );
  });

  it('marks usable images as focusable buttons on init, skipping unusable ones', async () => {
    const { root } = await setup(GalleryHostComponent);

    const first = root.querySelector<HTMLImageElement>('#first')!;
    expect(first.getAttribute('tabindex')).toBe('0');
    expect(first.getAttribute('role')).toBe('button');
    expect(first.getAttribute('aria-label')).toBe('Open image: First shot');
    expect(first.classList.contains('md-image-zoomable')).toBe(true);

    expect(root.querySelector('#broken')!.hasAttribute('tabindex')).toBe(false);
    expect(root.querySelector('#placeholder')!.hasAttribute('tabindex')).toBe(false);
  });

  it('marks images streamed in after init via the MutationObserver', async () => {
    const { root } = await setup(GalleryHostComponent);
    const container = root.querySelector<HTMLElement>('div')!;

    const late = document.createElement('img');
    late.setAttribute('src', 'https://assets.test/late.png');
    late.setAttribute('alt', 'Late');
    container.appendChild(late);
    // MutationObserver callbacks flush with the microtask queue.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(late.getAttribute('tabindex')).toBe('0');
    expect(late.getAttribute('role')).toBe('button');
  });

  it('prefers the legacy data-results-lightbox wrapper over its inner thumbnail', async () => {
    const { root, openGallery } = await setup(LegacyHostComponent);

    root
      .querySelector('#thumb')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(openGallery).toHaveBeenCalledTimes(1);
    expect(openGallery).toHaveBeenCalledWith({
      images: [
        { src: 'https://assets.test/full.png', alt: 'Full resolution' },
        { src: 'https://assets.test/plain.png', alt: 'Plain' },
      ],
      index: 0,
    });
  });
});
