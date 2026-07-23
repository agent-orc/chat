/*
 * Public API surface of coding-agent-chat/history
 *
 * The project-chat history surface: `<cac-chat-row>` (shared row
 * presentation over role badge + markdown body), the virtualised
 * `<cac-project-chat-list>` with its pure load-strategy helpers, the
 * `<cac-project-chat-rail>` minimap, the `<cac-phase-summary-list>`
 * compression layer, the `ProjectChatTurn` wire contract, and the two
 * host seams the list loads through (PROJECT_CHAT_DATA_SOURCE,
 * CHAT_HISTORY_CONFIRM — both defaulting to safe no-ops).
 */

export * from './project-chat.model';
export * from './history-window-config';
export * from './load-strategy';
export * from './project-chat-data-source.token';
export * from './chat-history-confirm.token';
export * from './chat-row/chat-row.component';
export * from './phase-summary-list/phase-summary-list.component';
export * from './project-chat-rail/project-chat-rail.component';
export * from './project-chat-list/project-chat-list.component';
