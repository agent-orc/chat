/*
 * Public API surface of coding-agent-chat/conversation
 *
 * The Activity-chat renderer over `ConversationEvent[]`: the grouping/folding
 * `<cac-conversation-view>` plus its dense sub-renderers
 * `<cac-tool-burst-chip>` and `<cac-conversation-session-card>`. All
 * presentational — host wiring (data source, trace, follow-up) flows through
 * inputs/outputs.
 */

export * from './conversation-view/conversation-view.component';
export * from './tool-burst-chip/tool-burst-chip.component';
export * from './conversation-session-card/conversation-session-card.component';
export * from './pixel-progress/pixel-progress.component';
export * from './plan-checklist/plan-checklist.component';
