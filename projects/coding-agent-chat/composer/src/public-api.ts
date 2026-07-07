/*
 * Public API surface of coding-agent-chat/composer
 *
 * The Orchestrator chat surface: `<cac-chat>` (composer + timeline over the
 * legacy ChatMessage/ChatEvent contract, draft/paste/drop/attachments, no
 * backend), the `<cac-role-badge>` workforce-role badge, and the pure
 * role-attribution + phase-grouping helpers (ROLE_CATALOGUE, resolveRole,
 * groupIntoPhases / groupIntoSuperPhases).
 */

export * from './workforce-role';
export * from './chat-phase';
export * from './role-badge/role-badge.component';
export * from './chat/chat.component';
export * from './model-selector/model-selector.component';
export * from './permission-select/permission-select.component';
export * from './context-ring/context-ring.component';
