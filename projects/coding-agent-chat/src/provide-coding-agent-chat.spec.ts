// Covers provideCodingAgentChat(): both seams keep their no-op root defaults
// without options, and bind to host classes via useExisting (shared instance).

import { Injectable, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Component } from '@angular/core';

import {
  CHAT_TASK_REFERENCE_PROVIDER,
  ChatTaskReferenceProvider,
  INLINE_REFERENCE_RENDERERS,
  InlineReferenceMatcher,
  MarkdownTaskReference,
} from 'coding-agent-chat/markdown';
import {
  CHAT_MEDIA_LIGHTBOX,
  ChatMediaLightbox,
  MediaLightboxGalleryRequest,
} from 'coding-agent-chat/shared';

import { provideCodingAgentChat } from './provide-coding-agent-chat';

@Injectable()
class FakeTaskReferenceProvider implements ChatTaskReferenceProvider {
  readonly markdownReferences = signal<readonly MarkdownTaskReference[]>([
    { label: 'ASS-1', taskKey: 'ASS-1' },
  ]).asReadonly();
  openTaskKey(): boolean {
    return true;
  }
}

@Injectable()
class FakeMediaLightbox implements ChatMediaLightbox {
  readonly requests: MediaLightboxGalleryRequest[] = [];
  openGallery(request: MediaLightboxGalleryRequest): void {
    this.requests.push(request);
  }
}

describe('provideCodingAgentChat', () => {
  it('leaves both seams on their no-op defaults when called without options', () => {
    TestBed.configureTestingModule({ providers: [provideCodingAgentChat()] });

    const refs = TestBed.inject(CHAT_TASK_REFERENCE_PROVIDER);
    expect(refs.markdownReferences()).toEqual([]);
    expect(refs.openTaskKey('ASS-1')).toBe(false);

    const lightbox = TestBed.inject(CHAT_MEDIA_LIGHTBOX);
    expect(() => lightbox.openGallery({ images: [] })).not.toThrow();
  });

  it('binds CHAT_TASK_REFERENCE_PROVIDER to the host class via useExisting', () => {
    TestBed.configureTestingModule({
      providers: [
        FakeTaskReferenceProvider,
        provideCodingAgentChat({ taskReferences: FakeTaskReferenceProvider }),
      ],
    });

    const viaToken = TestBed.inject(CHAT_TASK_REFERENCE_PROVIDER);
    expect(viaToken).toBe(TestBed.inject(FakeTaskReferenceProvider));
    expect(viaToken.openTaskKey('ASS-1')).toBe(true);
    expect(viaToken.markdownReferences()).toEqual([
      { label: 'ASS-1', taskKey: 'ASS-1' },
    ]);
  });

  it('binds CHAT_MEDIA_LIGHTBOX to the host class via useExisting', () => {
    TestBed.configureTestingModule({
      providers: [
        FakeMediaLightbox,
        provideCodingAgentChat({ mediaLightbox: FakeMediaLightbox }),
      ],
    });

    const viaToken = TestBed.inject(CHAT_MEDIA_LIGHTBOX);
    const instance = TestBed.inject(FakeMediaLightbox);
    expect(viaToken).toBe(instance);

    const request: MediaLightboxGalleryRequest = {
      images: [{ src: 'https://assets.test/x.png' }],
      index: 0,
    };
    viaToken.openGallery(request);
    expect(instance.requests).toEqual([request]);
  });

  it('configuring one seam leaves the other on its default', () => {
    TestBed.configureTestingModule({
      providers: [
        FakeMediaLightbox,
        provideCodingAgentChat({ mediaLightbox: FakeMediaLightbox }),
      ],
    });

    const refs = TestBed.inject(CHAT_TASK_REFERENCE_PROVIDER);
    expect(refs.markdownReferences()).toEqual([]);
    expect(refs.openTaskKey('ASS-9')).toBe(false);
  });

  it('leaves INLINE_REFERENCE_RENDERERS empty by default and registers the given matchers', () => {
    @Component({ selector: 'host-ref', standalone: true, template: '' })
    class HostRefComponent {}
    const matchers: InlineReferenceMatcher[] = [
      { id: 'task', pattern: /\b[A-Z]{2,}-\d+\b/g, component: HostRefComponent },
    ];

    TestBed.configureTestingModule({ providers: [provideCodingAgentChat()] });
    expect(TestBed.inject(INLINE_REFERENCE_RENDERERS)).toEqual([]);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideCodingAgentChat({ inlineReferences: matchers })],
    });
    expect(TestBed.inject(INLINE_REFERENCE_RENDERERS)).toBe(matchers);
  });
});
