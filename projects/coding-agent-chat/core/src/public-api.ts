/*
 * Public API surface of @coding-agent/chat/core
 *
 * The pure, zero-Angular kernel: the ConversationEvent wire contract, the
 * legacy ChatMessage/ChatEvent composer contract, and the pure helpers
 * (session/rate-limit meta parsing, chronological merge). Importable with no
 * Angular weight so backends, SSR and tests can consume the types without the
 * renderer.
 */

export * from './conversation-event';
export * from './conversation-session-meta';
export * from './merge-by-timestamp';
export * from './chat-types';
