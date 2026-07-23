import {
  DEFAULT_CHAT_HISTORY_WINDOW_CONFIG,
  resolveChatHistoryWindowConfig,
} from './history-window-config';

describe('history window configuration', () => {
  it('ships the documented benchmark-backed defaults', () => {
    expect(DEFAULT_CHAT_HISTORY_WINDOW_CONFIG).toMatchObject({
      messageCountThreshold: 500,
      messageAgeDays: 7,
      smallChatMessageCount: 30,
      loadMoreMessageCount: 1000,
      maxWindowMessageCount: 5000,
    });
  });

  it('merges partial overrides without mutating the defaults', () => {
    const resolved = resolveChatHistoryWindowConfig({
      messageAgeDays: 14,
      loadMoreMessageCount: 250,
    });
    expect(resolved.messageAgeDays).toBe(14);
    expect(resolved.loadMoreMessageCount).toBe(250);
    expect(resolved.messageCountThreshold).toBe(500);
    expect(DEFAULT_CHAT_HISTORY_WINDOW_CONFIG.messageAgeDays).toBe(7);
  });

  it('rejects unsafe or contradictory thresholds', () => {
    expect(() => resolveChatHistoryWindowConfig({ loadMoreMessageCount: 0 })).toThrow(
      /positive number/,
    );
    expect(() =>
      resolveChatHistoryWindowConfig({
        smallChatMessageCount: 50,
        maxWindowMessageCount: 40,
      }),
    ).toThrow(/cannot exceed/);
  });
});
