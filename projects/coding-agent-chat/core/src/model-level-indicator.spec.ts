import { modelLevelIndicator } from './model-level-indicator';

describe('modelLevelIndicator', () => {
  it('uses a stable family code and compact thinking marker', () => {
    expect(modelLevelIndicator('claude-sonnet-5', 'high')).toMatchObject({ family: 'claude', code: 'CLD', level: 'H' });
    expect(modelLevelIndicator('gpt-5-codex', 'xhigh')).toMatchObject({ family: 'codex', code: 'CDX', level: 'XH' });
  });

  it('does not render an indicator for an unattributed model', () => {
    expect(modelLevelIndicator(null, 'high')).toBeNull();
  });
});
