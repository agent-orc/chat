/*
 * Public API surface of @coding-agent/chat/shared
 *
 * Vendored, namespaced UI primitives shared by the renderer and composer:
 * the canonical hover tooltip (`cacTooltip`), the stick-to-bottom scroll
 * directive (`cacStickToBottom`), and the markdown image lightbox directive
 * (`cacMarkdownLightbox`) decoupled from the host via the optional
 * CHAT_MEDIA_LIGHTBOX token. All selectors and injected styles are `cac-`
 * namespaced so `ViewEncapsulation.None` consumers cannot leak globally.
 */

export * from './tooltip.types';
export * from './tooltip.controller';
export * from './tooltip.directive';
export * from './stick-to-bottom.directive';
export * from './anchored-popover.directive';
export * from './media-lightbox.token';
export * from './markdown-image-lightbox.directive';
