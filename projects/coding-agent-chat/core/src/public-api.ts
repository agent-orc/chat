/*
 * Public API surface of coding-agent-chat/core
 *
 * The pure, zero-Angular kernel: the ConversationEvent wire contract, the
 * legacy ChatMessage/ChatEvent composer contract, the lib-owned projection
 * inputs and the `projectConversation` projection (evidence -> events), plus
 * the pure helpers (session/rate-limit meta parsing, chronological merge, the
 * activity-log grouper). Importable with no Angular weight so backends, SSR
 * and tests can consume the types without the renderer.
 */

export * from './conversation-event';
export * from './conversation-session-meta';
export * from './merge-by-timestamp';
export * from './chat-types';
export * from './composer-controls';
export * from './projection-inputs';
export * from './conversation-projection';

// The activity-log grouper is the projection's canonical pre-parser. Re-export
// the same headless surface the host blessed (parse + conversation turns +
// types). The parser's own ChatMessage/ChatRole shapes are intentionally NOT
// re-exported here — they would collide with the composer contract in
// chat-types; consumers that need them import the module directly.
export {
  parseActivityLog,
  buildConversationTurns,
  type ActivityLogGroup,
  type ActivityLogKind,
} from './activity-log.parser';
