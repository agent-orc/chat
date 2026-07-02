/*
 * Public API surface of @coding-agent/chat
 *
 * The primary entry point re-exports every secondary entry point plus the
 * `provideCodingAgentChat()` host-wiring helper. Consumers who care about
 * bundle weight import the secondary entry points directly —
 * `@coding-agent/chat/core` stays zero-Angular for backends, SSR and tests.
 */

export * from '@coding-agent/chat/core';
export * from '@coding-agent/chat/markdown';
export * from '@coding-agent/chat/shared';
export * from '@coding-agent/chat/conversation';
export * from '@coding-agent/chat/composer';

export * from './provide-coding-agent-chat';
