import { Injectable, computed, signal } from '@angular/core';
import type {
  ChatMediaLightbox,
  MediaLightboxGalleryRequest,
  MediaLightboxImageRef,
} from 'coding-agent-chat/shared';

/**
 * Host implementation of `CHAT_MEDIA_LIGHTBOX` for the lab: the library only
 * reports which image was activated and hands over the gallery; this service
 * holds the open state and the App template renders the actual overlay. A
 * real app would wire its own modal stack here instead.
 */
@Injectable({ providedIn: 'root' })
export class LabLightboxService implements ChatMediaLightbox {
  private readonly images = signal<readonly MediaLightboxImageRef[]>([]);
  private readonly index = signal(0);

  /** The image currently enlarged, or null when the lightbox is closed. */
  readonly current = computed<MediaLightboxImageRef | null>(() => this.images()[this.index()] ?? null);
  readonly count = computed<number>(() => this.images().length);
  readonly position = computed<string>(() => `${this.index() + 1} / ${this.count()}`);

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
    if (this.count() === 0) return;
    this.index.update((i) => (i + 1) % this.count());
  }

  prev(): void {
    if (this.count() === 0) return;
    this.index.update((i) => (i - 1 + this.count()) % this.count());
  }
}
