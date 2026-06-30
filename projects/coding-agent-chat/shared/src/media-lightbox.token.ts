import { InjectionToken } from '@angular/core';

/**
 * One image handed to the lightbox. The minimal shape the markdown image
 * directive collects from rendered `<img>` elements.
 */
export interface MediaLightboxImageRef {
  readonly src: string;
  readonly alt?: string | null;
}

/** A paged set of images plus the index that was activated. */
export interface MediaLightboxGalleryRequest {
  readonly images: readonly MediaLightboxImageRef[];
  /** Index of the image that was clicked; the host clamps it into range. */
  readonly index?: number;
}

/**
 * Optional host seam for the click-to-enlarge behaviour. The library only
 * detects which rendered image was activated and hands the gallery over; the
 * host owns the actual overlay (modal stack, focus trap, Escape ordering).
 * Defaults to a no-op so images render and are focusable without a host
 * implementation — the host binds its own `MediaLightboxService` to enable
 * the zoom overlay.
 */
export interface ChatMediaLightbox {
  openGallery(request: MediaLightboxGalleryRequest): void;
}

export const CHAT_MEDIA_LIGHTBOX = new InjectionToken<ChatMediaLightbox>(
  'CHAT_MEDIA_LIGHTBOX',
  {
    providedIn: 'root',
    factory: (): ChatMediaLightbox => ({ openGallery: () => {} }),
  },
);
