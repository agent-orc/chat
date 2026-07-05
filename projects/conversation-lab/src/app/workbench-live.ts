/**
 * Live-mode client for the local workbench host (`workbench/` in this repo —
 * a .NET Minimal API wrapping the published CodingAgentRunner NuGet package).
 *
 * Protocol: `POST /api/sessions` starts a real CLI session with the first
 * prompt, `POST /api/sessions/{id}/messages` sends follow-ups (the workbench
 * chains one-shot runs via the CLI-native resume session id), and
 * `GET /api/sessions/{id}/stream` is a Server-Sent-Events feed where every
 * `data:` payload is one `CliOutputLine` ({timestamp, stream, text}) — the
 * exact projection input shape from '@coding-agent/chat/core'.
 *
 * The received lines are collected in a signal and projected through
 * `projectConversation` into `ConversationEvent[]`, so the SAME renderer
 * (`<cac-conversation-view>`) that paints the demo fixtures paints the real
 * CLI transcript.
 */

import { Injectable, computed, signal } from '@angular/core';
import {
  projectConversation,
  type CliOutputLine,
  type ConversationEvent,
  type RunInfoLite,
  type RunTimelineLite,
  type TaskInfoLite,
} from '@coding-agent/chat/core';

export type WorkbenchCliType = 'claude' | 'codex' | 'gemini';
export type WorkbenchConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export const WORKBENCH_CLI_TYPES: readonly WorkbenchCliType[] = ['claude', 'codex', 'gemini'];
export const DEFAULT_WORKBENCH_URL = 'http://localhost:5055';

@Injectable({ providedIn: 'root' })
export class WorkbenchLiveSession {
  readonly baseUrl = signal(DEFAULT_WORKBENCH_URL);
  readonly cliType = signal<WorkbenchCliType>('claude');
  readonly connection = signal<WorkbenchConnectionState>('disconnected');
  readonly sessionId = signal<string | null>(null);
  /** Transient error toast text; null hides the toast. */
  readonly error = signal<string | null>(null);
  /** True while a POST (session start / follow-up) is in flight. */
  readonly sending = signal(false);

  private readonly lines = signal<readonly CliOutputLine[]>([]);
  private eventSource: EventSource | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /** Raw stream lines as received — the projection input, for the host's Trace view. */
  readonly rawLines = this.lines.asReadonly();

  /**
   * True while the CLI is working on a run — drives the conversation view's
   * "Working" indicator. Derived from the stream itself: the host echoes the
   * prompt as a `user` line the moment a run starts, and closes every run
   * with a `[taskboard] Exited …` bookkeeping line (or a "Failed to start"
   * stderr line when the CLI never came up). `sending` bridges the gap
   * before the first echoed line arrives.
   */
  readonly running = computed<boolean>(() => {
    if (this.sessionId() === null) {
      return this.sending();
    }
    const lines = this.lines();
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.stream === 'system' && /^\[taskboard\] Exited\b/.test(line.text)) return false;
      if (line.stream === 'stderr' && /^Failed to start\b/.test(line.text)) return false;
      if (line.stream === 'user') return true;
    }
    return this.sending();
  });

  /**
   * The live conversation: raw CliOutputLines projected into ConversationEvents
   * via the library's pure projection. The run-timeline / task inputs are
   * minimal `…Lite` stubs — enough context for run association; all real
   * classification comes from the lines themselves.
   */
  readonly events = computed<readonly ConversationEvent[]>(() => {
    const lines = this.lines();
    if (lines.length === 0) {
      return [];
    }
    const source = `workbench:${this.sessionId() ?? 'session'}`;
    const runStub: RunInfoLite = {
      index: 1,
      intent: 'start',
      startedAt: lines[0].timestamp,
      status: this.running() ? 'running' : 'unknown',
      cli: this.cliType(),
      exitCode: null,
      durationSeconds: null,
      capturedSessionId: this.sessionId(),
      lineStart: 1,
      lineEnd: null,
    };
    const timelineStub: RunTimelineLite = { runCount: 1, runs: [runStub] };
    const taskStub: TaskInfoLite = {
      id: this.sessionId() ?? 'workbench-live',
      title: 'Workbench live session',
      state: '3-progress',
    };
    return projectConversation({
      source,
      lines: [...lines],
      runTimeline: timelineStub,
      task: taskStub,
    });
  });

  /** Ping the workbench host so the user gets immediate reachability feedback. */
  async connect(): Promise<void> {
    this.reset();
    this.connection.set('connecting');
    try {
      const response = await fetch(`${this.normalizedBaseUrl()}/api/health`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) {
        throw new Error(`health check failed (HTTP ${response.status})`);
      }
      this.connection.set('connected');
    } catch (error) {
      this.connection.set('error');
      this.toast(`Workbench nicht erreichbar unter ${this.normalizedBaseUrl()} — läuft \`dotnet run --project workbench\`? (${describeError(error)})`);
    }
  }

  /**
   * Composer submit in live mode: the first message starts the session
   * (POST /api/sessions), every further one is a follow-up run.
   */
  async submit(text: string): Promise<void> {
    if (this.sending()) {
      this.toast('Der Agent arbeitet noch an der vorherigen Nachricht.');
      return;
    }
    this.sending.set(true);
    try {
      const id = this.sessionId();
      if (id === null) {
        await this.startSession(text);
      } else {
        await this.postMessage(id, text);
      }
    } catch (error) {
      this.toast(describeError(error));
      if (this.connection() !== 'connected') {
        this.connection.set('error');
      }
    } finally {
      this.sending.set(false);
    }
  }

  /** Stop the live session (DELETE) and close the event stream. */
  async stop(): Promise<void> {
    const id = this.sessionId();
    this.closeStream();
    this.sessionId.set(null);
    this.connection.set('disconnected');
    if (id !== null) {
      try {
        await fetch(`${this.normalizedBaseUrl()}/api/sessions/${id}`, { method: 'DELETE' });
      } catch {
        // Host already gone — nothing left to stop.
      }
    }
  }

  dismissError(): void {
    this.error.set(null);
  }

  private async startSession(prompt: string): Promise<void> {
    const response = await fetch(`${this.normalizedBaseUrl()}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliType: this.cliType(), prompt }),
    });
    if (!response.ok) {
      throw new Error(await errorBody(response, 'Session konnte nicht gestartet werden'));
    }
    const body = (await response.json()) as { sessionId: string };
    this.sessionId.set(body.sessionId);
    this.openStream(body.sessionId);
  }

  private async postMessage(id: string, text: string): Promise<void> {
    const response = await fetch(`${this.normalizedBaseUrl()}/api/sessions/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (response.status === 409) {
      throw new Error('Der Agent arbeitet noch — bitte warten, bis der aktuelle Lauf endet.');
    }
    if (!response.ok) {
      throw new Error(await errorBody(response, 'Nachricht konnte nicht gesendet werden'));
    }
  }

  private openStream(id: string): void {
    this.closeStream();
    const source = new EventSource(`${this.normalizedBaseUrl()}/api/sessions/${id}/stream`);
    this.eventSource = source;
    source.onopen = () => this.connection.set('connected');
    source.onmessage = (message) => {
      const line = parseCliOutputLine(message.data);
      if (line !== null) {
        this.lines.update((list) => [...list, line]);
      }
    };
    source.onerror = () => {
      // EventSource auto-reconnects; only surface a hard error while the
      // session is still supposed to be live.
      if (this.eventSource === source && this.sessionId() !== null) {
        this.connection.set('error');
        this.toast('Verbindung zum Workbench-Stream verloren.');
      }
    };
  }

  private closeStream(): void {
    this.eventSource?.close();
    this.eventSource = null;
  }

  private reset(): void {
    this.closeStream();
    this.sessionId.set(null);
    this.lines.set([]);
    this.sending.set(false);
  }

  private normalizedBaseUrl(): string {
    return this.baseUrl().trim().replace(/\/+$/, '') || DEFAULT_WORKBENCH_URL;
  }

  private toast(message: string): void {
    this.error.set(message);
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => this.error.set(null), 8000);
  }
}

function parseCliOutputLine(data: string): CliOutputLine | null {
  try {
    const raw = JSON.parse(data) as Partial<CliOutputLine>;
    if (typeof raw.timestamp !== 'string' || typeof raw.stream !== 'string' || typeof raw.text !== 'string') {
      return null;
    }
    return { timestamp: raw.timestamp, stream: raw.stream, text: raw.text };
  } catch {
    return null;
  }
}

async function errorBody(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; detail?: string };
    return body.error ?? body.detail ?? `${fallback} (HTTP ${response.status})`;
  } catch {
    return `${fallback} (HTTP ${response.status})`;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
