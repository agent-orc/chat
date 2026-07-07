import { Injectable, computed, signal } from '@angular/core';
import type {
  ChatMediaLightbox,
  MediaLightboxGalleryRequest,
  MediaLightboxImageRef,
} from 'coding-agent-chat/shared';

/**
 * The site's half of the CHAT_MEDIA_LIGHTBOX seam: the library detects the
 * image click (any <img> inside cac-markdown / artifact rows) and calls
 * openGallery(); this service holds the open state and the App template
 * renders the actual overlay. Mirrors the conversation-lab implementation.
 */
@Injectable({ providedIn: 'root' })
export class WebsiteLightboxService implements ChatMediaLightbox {
  private readonly images = signal<readonly MediaLightboxImageRef[]>([]);
  private readonly index = signal(0);

  readonly current = computed(() => this.images()[this.index()] ?? null);
  readonly count = computed(() => this.images().length);
  readonly position = computed(() => `${this.index() + 1} / ${this.count()}`);

  openGallery(request: MediaLightboxGalleryRequest): void {
    const images = request.images ?? [];
    if (images.length === 0) return;
    this.images.set(images);
    this.index.set(Math.min(Math.max(0, request.index ?? 0), images.length - 1));
  }

  close(): void {
    this.images.set([]);
    this.index.set(0);
  }

  next(): void {
    if (this.count() > 0) this.index.update((i) => (i + 1) % this.count());
  }

  prev(): void {
    if (this.count() > 0) this.index.update((i) => (i - 1 + this.count()) % this.count());
  }
}
