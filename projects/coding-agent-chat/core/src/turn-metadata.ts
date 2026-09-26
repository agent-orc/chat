/** Facts supplied by the host for one assistant turn. Omitted facts stay unknown. */
export interface TurnMetadata {
  provider?: string;
  model?: string;
  /** Host-defined mode key, such as `codex-exec` or `chat-session`. */
  mode?: string;
  thinkingLevel?: string;
  tokens?: {
    input?: number;
    cachedInput?: number;
    output?: number;
    reasoning?: number;
  };
  cost?: { amount?: number; currency?: string; priceSource?: string };
  durations?: {
    queuedAt?: string;
    startedAt?: string;
    firstTokenAt?: string;
    finishedAt?: string;
    /** Measured elapsed time supplied by the host, in milliseconds. */
    totalMs?: number;
  };
  sessionId?: string;
  threadId?: string;
  host?: string;
  seat?: string;
}

export type TurnMetadataField =
  | 'provider'
  | 'model'
  | 'mode'
  | 'thinkingLevel'
  | 'tokens.input'
  | 'tokens.cachedInput'
  | 'tokens.output'
  | 'tokens.reasoning'
  | 'cost.amount'
  | 'cost.currency'
  | 'cost.priceSource'
  | 'durations.queuedAt'
  | 'durations.startedAt'
  | 'durations.firstTokenAt'
  | 'durations.finishedAt'
  | 'durations.totalMs'
  | 'sessionId'
  | 'threadId'
  | 'host'
  | 'seat';

/** The fields a particular host mode can actually report. */
export interface TurnMetadataCapabilities {
  fields: readonly TurnMetadataField[];
}

/** Options for metadata rendering. No capabilities means no new metadata UI. */
export interface TurnMetadataOptions {
  enabled?: boolean;
  fields?: readonly TurnMetadataField[];
  capabilities?: Readonly<Record<string, TurnMetadataCapabilities>>;
}

export interface TurnMetadataChip {
  label: string;
  value: string;
  title: string;
}

function allowed(
  field: TurnMetadataField,
  metadata: TurnMetadata,
  options: TurnMetadataOptions,
): boolean {
  if (options.enabled === false) return false;
  const capable =
    options.capabilities?.[metadata.mode ?? '']?.fields ?? options.capabilities?.['*']?.fields;
  return (
    !!capable?.includes(field) && (options.fields === undefined || options.fields.includes(field))
  );
}

function number(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Filter both unsupported and absent facts before they reach a renderer. */
export function visibleTurnMetadata(
  metadata: TurnMetadata | null | undefined,
  options: TurnMetadataOptions,
): TurnMetadata | null {
  if (!metadata) return null;
  const text = (field: TurnMetadataField, value: string | undefined) =>
    allowed(field, metadata, options) && value?.trim() ? value.trim() : undefined;
  const numeric = (field: TurnMetadataField, value: number | undefined) =>
    allowed(field, metadata, options) ? number(value) : undefined;
  const tokens = {
    input: numeric('tokens.input', metadata.tokens?.input),
    cachedInput: numeric('tokens.cachedInput', metadata.tokens?.cachedInput),
    output: numeric('tokens.output', metadata.tokens?.output),
    reasoning: numeric('tokens.reasoning', metadata.tokens?.reasoning),
  };
  const amount = numeric('cost.amount', metadata.cost?.amount);
  const currency = text('cost.currency', metadata.cost?.currency);
  const durations = {
    queuedAt: text('durations.queuedAt', metadata.durations?.queuedAt),
    startedAt: text('durations.startedAt', metadata.durations?.startedAt),
    firstTokenAt: text('durations.firstTokenAt', metadata.durations?.firstTokenAt),
    finishedAt: text('durations.finishedAt', metadata.durations?.finishedAt),
    totalMs: numeric('durations.totalMs', metadata.durations?.totalMs),
  };
  const result: TurnMetadata = {
    provider: text('provider', metadata.provider),
    model: text('model', metadata.model),
    mode: text('mode', metadata.mode),
    thinkingLevel: text('thinkingLevel', metadata.thinkingLevel),
    tokens: Object.values(tokens).some((v) => v !== undefined) ? tokens : undefined,
    cost:
      amount !== undefined && currency
        ? { amount, currency, priceSource: text('cost.priceSource', metadata.cost?.priceSource) }
        : undefined,
    durations: Object.values(durations).some((v) => v !== undefined) ? durations : undefined,
    sessionId: text('sessionId', metadata.sessionId),
    threadId: text('threadId', metadata.threadId),
    host: text('host', metadata.host),
    seat: text('seat', metadata.seat),
  };
  return Object.values(result).some((v) => v !== undefined) ? result : null;
}

function durationMs(durations: TurnMetadata['durations']): number | undefined {
  if (durations?.totalMs !== undefined) return durations.totalMs;
  if (!durations?.startedAt || !durations.finishedAt) return undefined;
  const elapsed = Date.parse(durations.finishedAt) - Date.parse(durations.startedAt);
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : undefined;
}

export function turnMetadataChips(
  metadata: TurnMetadata | null | undefined,
  options: TurnMetadataOptions,
): readonly TurnMetadataChip[] {
  const m = visibleTurnMetadata(metadata, options);
  if (!m) return [];
  const chips: TurnMetadataChip[] = [];
  const add = (label: string, value: string | undefined): void => {
    if (value) chips.push({ label, value, title: `${label} ${value}` });
  };
  if (m.model) chips.push({ label: 'Model', value: m.model, title: `Model ${m.model}` });
  add('Provider', m.provider);
  add('Mode', m.mode);
  add('Think', m.thinkingLevel);
  const tokenCount = (m.tokens?.input ?? 0) + (m.tokens?.output ?? 0);
  if (m.tokens?.input !== undefined || m.tokens?.output !== undefined) {
    const details = [
      m.tokens?.input !== undefined ? `input ${m.tokens.input}` : null,
      m.tokens?.cachedInput !== undefined ? `cached input ${m.tokens.cachedInput}` : null,
      m.tokens?.output !== undefined ? `output ${m.tokens.output}` : null,
      m.tokens?.reasoning !== undefined ? `reasoning ${m.tokens.reasoning}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    const value =
      m.tokens.input !== undefined && m.tokens.output !== undefined
        ? tokenCount.toLocaleString('en-US')
        : m.tokens.input !== undefined
          ? `input ${m.tokens.input.toLocaleString('en-US')}`
          : `output ${m.tokens.output!.toLocaleString('en-US')}`;
    chips.push({ label: 'Tokens', value, title: `Tokens: ${details}` });
  } else if (m.tokens?.cachedInput !== undefined || m.tokens?.reasoning !== undefined) {
    const details = [
      m.tokens.cachedInput !== undefined ? `cached input ${m.tokens.cachedInput}` : null,
      m.tokens.reasoning !== undefined ? `reasoning ${m.tokens.reasoning}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    chips.push({ label: 'Tokens', value: details, title: `Tokens: ${details}` });
  }
  if (m.cost?.amount !== undefined && m.cost.currency) {
    const value = `${m.cost.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${m.cost.currency}`;
    chips.push({
      label: 'Cost',
      value,
      title: `Cost ${value}${m.cost.priceSource ? `, source ${m.cost.priceSource}` : ''}`,
    });
  }
  const ms = durationMs(m.durations);
  if (ms !== undefined)
    chips.push({
      label: 'Duration',
      value: ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`,
      title: `Duration ${ms} milliseconds`,
    });
  add('Queued', m.durations?.queuedAt);
  add('Started', m.durations?.startedAt);
  add('First token', m.durations?.firstTokenAt);
  add('Finished', m.durations?.finishedAt);
  add('Session', m.sessionId);
  add('Thread', m.threadId);
  add('Host', m.host);
  add('Seat', m.seat);
  return chips;
}

export interface TurnMetadataSummary {
  turns: number;
  tokens?: number;
  costs: readonly { currency: string; amount: number }[];
  averageLatencyMs?: number;
}

/** Summarise visible facts only; cached and reasoning tokens are subsets. */
export function summarizeTurnMetadata(
  turns: readonly (TurnMetadata | null | undefined)[],
  options: TurnMetadataOptions,
): TurnMetadataSummary | null {
  const visible = turns
    .map((turn) => visibleTurnMetadata(turn, options))
    .filter((turn): turn is TurnMetadata => turn !== null);
  if (!visible.length) return null;
  let tokens = 0;
  let tokenReports = 0;
  let latency = 0;
  let latencyReports = 0;
  const costs = new Map<string, number>();
  for (const turn of visible) {
    if (turn.tokens?.input !== undefined || turn.tokens?.output !== undefined) {
      tokens += (turn.tokens.input ?? 0) + (turn.tokens.output ?? 0);
      tokenReports++;
    }
    if (turn.cost?.amount !== undefined && turn.cost.currency)
      costs.set(turn.cost.currency, (costs.get(turn.cost.currency) ?? 0) + turn.cost.amount);
    const ms = durationMs(turn.durations);
    if (ms !== undefined) {
      latency += ms;
      latencyReports++;
    }
  }
  return {
    turns: turns.length,
    tokens: tokenReports ? tokens : undefined,
    costs: [...costs].map(([currency, amount]) => ({ currency, amount })),
    averageLatencyMs: latencyReports ? latency / latencyReports : undefined,
  };
}

export function turnMetadataSummaryLabel(summary: TurnMetadataSummary | null): string | null {
  if (!summary) return null;
  const parts = [`${summary.turns} ${summary.turns === 1 ? 'turn' : 'turns'}`];
  if (summary.tokens !== undefined)
    parts.push(`${summary.tokens.toLocaleString('en-US')} reported tokens`);
  for (const cost of summary.costs) {
    parts.push(
      `${cost.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${cost.currency}`,
    );
  }
  if (summary.averageLatencyMs !== undefined) {
    parts.push(`average latency ${(summary.averageLatencyMs / 1000).toFixed(1)} s`);
  }
  return parts.join(' · ');
}
