/*
 * Public API surface of @coding-agent/chat/markdown
 *
 * The markdown kernel: GFM rendering with sanitised links, numbered code
 * blocks, image-source transforms and task-reference auto-linking. Pure
 * TypeScript over `marked` + `dompurify`, with SSR (`typeof document`) guards
 * so it is safe to import outside a browser. The Angular MARKDOWN_RENDERER
 * provider that wraps this kernel is added in a later phase.
 */

export * from './markdown-utils';
