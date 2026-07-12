import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostListener,
  OnDestroy,
  inject,
} from '@angular/core';

import { resolveScrollContainer } from './scroll-container.util';
import { ScrollArrowKeysRegistry } from './scroll-arrow-keys.registry';

@Directive({
  selector: '[cacArrowKeyScroll]',
  standalone: true,
})
export class ArrowKeyScrollDirective implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly registry = inject(ScrollArrowKeysRegistry);
  private readonly surfaceId = this.registry.register(this.host.nativeElement);
  private container: HTMLElement | null = null;

  ngAfterViewInit(): void {
    if (typeof document === 'undefined') {
      this.container = null;
      return;
    }
    const resolved = resolveScrollContainer(this.host.nativeElement);
    if (!resolved || resolved === document.scrollingElement) {
      this.registry.unregister(this.surfaceId);
      this.container = null;
      return;
    }
    this.container = resolved;
    this.registry.updateSurface(this.surfaceId, resolved);
  }

  ngOnDestroy(): void {
    this.registry.unregister(this.surfaceId);
  }

  @HostListener('focusin')
  onFocusIn(): void {
    this.registry.markActive(this.surfaceId);
  }

  @HostListener('pointerdown')
  onPointerDown(): void {
    this.registry.markActive(this.surfaceId);
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.container) return;
    this.registry.handleKeydown(event, this.surfaceId);
  }
}
