import { describe, expect, it } from 'vitest';
import {
  summarizeTurnMetadata,
  turnMetadataChips,
  visibleTurnMetadata,
  type TurnMetadata,
  type TurnMetadataOptions,
} from './turn-metadata';

const turn: TurnMetadata = {
  mode: 'codex-exec',
  provider: 'OpenAI',
  model: 'gpt-example',
  tokens: { input: 100, cachedInput: 25, output: 40, reasoning: 12 },
  cost: { amount: 0.007, currency: 'USD', priceSource: 'catalog-2026' },
  durations: { startedAt: '2026-09-26T10:00:00Z', finishedAt: '2026-09-26T10:00:02Z' },
  sessionId: 'session-1',
};

const options: TurnMetadataOptions = {
  capabilities: {
    'codex-exec': {
      fields: [
        'model',
        'tokens.input',
        'tokens.cachedInput',
        'tokens.output',
        'cost.amount',
        'cost.currency',
        'durations.startedAt',
        'durations.finishedAt',
        'durations.totalMs',
      ],
    },
  },
};

describe('turn metadata capabilities', () => {
  it('keeps only capable, present fields and never promotes a missing cost currency', () => {
    expect(visibleTurnMetadata(turn, options)).toMatchObject({
      model: 'gpt-example',
      tokens: { input: 100, cachedInput: 25, output: 40 },
      cost: { amount: 0.007, currency: 'USD' },
    });
    expect(visibleTurnMetadata(turn, options)?.provider).toBeUndefined();
    expect(visibleTurnMetadata(turn, options)?.sessionId).toBeUndefined();
    expect(visibleTurnMetadata(turn, options)?.tokens?.reasoning).toBeUndefined();
    expect(visibleTurnMetadata(turn, { capabilities: {} })).toBeNull();
    expect(visibleTurnMetadata(turn, { ...options, enabled: false })).toBeNull();
    expect(visibleTurnMetadata(turn, { ...options, fields: ['model'] })?.tokens).toBeUndefined();
    expect(
      visibleTurnMetadata(
        { ...turn, cost: { amount: 1, currency: 'USD' } },
        {
          capabilities: { 'codex-exec': { fields: ['cost.amount'] } },
        },
      ),
    ).toBeNull();
  });

  it('renders partial tokens without claiming an unknown total', () => {
    const chips = turnMetadataChips({ mode: 'codex-exec', tokens: { cachedInput: 25 } }, options);
    expect(chips).toEqual([
      { label: 'Tokens', value: 'cached input 25', title: 'Tokens: cached input 25' },
    ]);
    expect(turnMetadataChips(turn, options).map((chip) => chip.label)).toEqual([
      'Model',
      'Tokens',
      'Cost',
      'Duration',
      'Started',
      'Finished',
    ]);
  });

  it('sums input and output once, keeps currencies separate, and averages reported latency', () => {
    expect(
      summarizeTurnMetadata(
        [
          turn,
          {
            ...turn,
            tokens: { input: 10, output: 5 },
            cost: { amount: 0.003, currency: 'EUR' },
            durations: { totalMs: 1000 },
          },
        ],
        options,
      ),
    ).toEqual({
      turns: 2,
      tokens: 155,
      costs: [
        { currency: 'USD', amount: 0.007 },
        { currency: 'EUR', amount: 0.003 },
      ],
      averageLatencyMs: 1500,
    });
  });

  it('counts assistant turns without metadata but does not fabricate their usage', () => {
    expect(summarizeTurnMetadata([turn, undefined], options)).toMatchObject({
      turns: 2,
      tokens: 140,
      averageLatencyMs: 2000,
    });
  });
});
