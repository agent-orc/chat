/**
 * Specs for the composer-control label helpers. The model selector is
 * host-agnostic: the host feeds the catalog and the selector must render
 * whatever ids it is given. `shortModelLabel` is the one place that turns an
 * opaque model id into chip text, so it must degrade gracefully for ids it
 * has no compaction rule for (new/unknown models such as gpt-5.6) — never
 * crash, always return something readable.
 */
import { describe, expect, it } from 'vitest';

import { formatTokenCount, shortModelLabel } from './composer-controls';

describe('shortModelLabel', () => {
  it('compacts the known claude id shape', () => {
    expect(shortModelLabel('claude-sonnet-5')).toBe('sonnet 5');
    expect(shortModelLabel('claude-opus-4-8')).toBe('opus 4.8');
    expect(shortModelLabel('claude-haiku-4-5')).toBe('haiku 4.5');
  });

  it('strips a vendor/ prefix', () => {
    expect(shortModelLabel('vendor/some-model')).toBe('some-model');
    expect(shortModelLabel('openai/gpt-5.6')).toBe('gpt-5.6');
  });

  it('passes new/unknown ids through unchanged as a readable fallback', () => {
    // No claude rule, no slash — the raw id is already readable, so it wins
    // over an empty or placeholder chip. This is the contract that lets a host
    // surface a brand-new model (gpt-5.6) with zero library changes.
    expect(shortModelLabel('gpt-5.6')).toBe('gpt-5.6');
    expect(shortModelLabel('gpt-5-codex')).toBe('gpt-5-codex');
    expect(shortModelLabel('some-future-model-x9')).toBe('some-future-model-x9');
  });

  it('never crashes on empty / whitespace / nullish input', () => {
    expect(shortModelLabel('')).toBe('No model');
    expect(shortModelLabel('   ')).toBe('No model');
    expect(shortModelLabel(null)).toBe('No model');
    expect(shortModelLabel(undefined)).toBe('No model');
  });

  it('does not mistake a trailing-slash id for a vendor prefix', () => {
    // Guard the slash branch: nothing after the slash means there is no
    // sub-label to surface, so the id passes through rather than becoming ''.
    expect(shortModelLabel('weird/')).toBe('weird/');
  });
});

describe('formatTokenCount', () => {
  it('formats sub-thousand, thousands and hundred-thousands', () => {
    expect(formatTokenCount(842)).toBe('842');
    expect(formatTokenCount(76_400)).toBe('76.4k');
    expect(formatTokenCount(200_000)).toBe('200k');
  });

  it('clamps invalid input to 0', () => {
    expect(formatTokenCount(-5)).toBe('0');
    expect(formatTokenCount(Number.NaN)).toBe('0');
  });
});
