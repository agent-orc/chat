/*
 * Public API surface of coding-agent-chat/markdown
 *
 * The markdown kernel (GFM rendering with sanitised links, numbered code
 * blocks, image-source transforms and task-reference auto-linking — pure
 * TypeScript over `marked` + `dompurify`, with SSR `typeof document` guards),
 * plus the `<cac-markdown>` render surface and the CHAT_TASK_REFERENCE_PROVIDER
 * host seam it linkifies through.
 */

export * from './markdown-utils';
export * from './chat-task-reference.token';
export * from './markdown-view.component';
