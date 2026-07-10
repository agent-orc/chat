/*
 * Public API surface of coding-agent-chat/markdown
 *
 * The markdown kernel (GFM rendering with sanitised links, numbered code
 * blocks, image-source transforms and task-reference auto-linking — pure
 * TypeScript over `marked` + `dompurify`, with SSR `typeof document` guards),
 * plus the `<cac-markdown>` render surface and its two host seams: the
 * CHAT_TASK_REFERENCE_PROVIDER it linkifies through, and the generic
 * INLINE_REFERENCE_RENDERERS extension point that slots host components in
 * place of matched tokens.
 */

export * from './markdown-utils';
export * from './chat-task-reference.token';
export * from './inline-reference.token';
export * from './markdown-view.component';
