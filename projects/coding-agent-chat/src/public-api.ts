/*
 * Public API surface of @coding-agent/chat
 *
 * The primary entry point re-exports the pure kernel for convenience. The
 * Angular renderer components and the `provideCodingAgentChat()` integration
 * point are carved out in later phases; until then consumers can already
 * import the frozen wire contract from here or, with zero Angular weight,
 * from `@coding-agent/chat/core`.
 */

export * from '@coding-agent/chat/core';
export * from '@coding-agent/chat/markdown';
