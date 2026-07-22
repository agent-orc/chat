/** Shared presentation definition for the compact model / thinking indicator. */
export interface ModelLevelIndicatorData {
  family: 'claude' | 'codex' | 'gemini' | 'openai' | 'other';
  code: string;
  level: string | null;
  label: string;
}

/** Returns the canonical compact model / thinking presentation data. */
export function modelLevelIndicator(model: string | null | undefined, thinking: string | null | undefined): ModelLevelIndicatorData | null {
  const modelId = model?.trim();
  if (!modelId) return null;
  const lower = modelId.toLowerCase();
  const family = lower.includes('claude') ? 'claude'
    : lower.includes('codex') ? 'codex'
    : lower.includes('gemini') ? 'gemini'
    : lower.includes('gpt') || lower.includes('openai') ? 'openai'
    : 'other';
  const code = { claude: 'CLD', codex: 'CDX', gemini: 'GEM', openai: 'GPT', other: 'AI' }[family];
  const level = compactThinkingLevel(thinking);
  return { family, code, level, label: `${modelId}${thinking?.trim() ? `, thinking ${thinking.trim()}` : ''}` };
}

function compactThinkingLevel(thinking: string | null | undefined): string | null {
  const value = thinking?.trim().toLowerCase();
  if (!value) return null;
  const known: Record<string, string> = { low: 'L', medium: 'M', high: 'H', xhigh: 'XH', minimal: 'MIN' };
  return known[value] ?? value.slice(0, 3).toUpperCase();
}
