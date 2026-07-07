/**
 * Replay engine for scripted scenarios (`kind: 'replay'` in `lab-scenarios.ts`).
 *
 * Feeds a scenario's `CliOutputLine[]` through the SAME projection
 * (`projectConversation`) the live workbench mode uses — either all at once
 * ("instant") or line-by-line on a timer ("stream") to simulate a live SSE
 * feed without a backend. Composer submits during a replay append a real
 * `user`-stream line, so the projection classifies the turn exactly as it
 * would in production.
 */

import { Injectable, computed, signal } from '@angular/core';
import {
  projectConversation,
  type CliOutputLine,
  type ConversationEvent,
  type RunInfoLite,
  type RunTimelineLite,
  type TaskInfoLite,
} from 'coding-agent-chat/core';

import type { ReplayScenario } from './lab-scenarios';

export type ReplayMode = 'instant' | 'stream';

const STREAM_INTERVAL_MS = 220;

@Injectable({ providedIn: 'root' })
export class ScenarioPlayer {
  private readonly scenario = signal<ReplayScenario | null>(null);
  /** How many scripted lines are currently visible. */
  private readonly shown = signal(0);
  /** User turns appended via the composer while the scenario is loaded. */
  private readonly appended = signal<readonly CliOutputLine[]>([]);

  readonly playing = signal(false);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly progress = computed(() => {
    const scenario = this.scenario();
    return { shown: this.shown(), total: scenario?.lines.length ?? 0 };
  });

  /**
   * The raw lines currently visible (scripted prefix + composer-appended) —
   * the exact projection input, exposed so the host can render a Trace view.
   */
  readonly visibleLines = computed<readonly CliOutputLine[]>(() => {
    const scenario = this.scenario();
    if (scenario === null) {
      return [];
    }
    return [...scenario.lines.slice(0, this.shown()), ...this.appended()];
  });

  readonly events = computed<readonly ConversationEvent[]>(() => {
    const scenario = this.scenario();
    if (scenario === null) {
      return [];
    }
    const lines = this.visibleLines();
    if (lines.length === 0) {
      return [];
    }
    return projectConversation({
      source: `lab-scenario:${scenario.id}`,
      lines: [...lines],
      runTimeline: scenario.runTimeline ?? this.stubTimeline(scenario, lines),
      task: this.stubTask(scenario),
    });
  });

  /** Load a scenario; `instant` shows the full transcript, `stream` plays it. */
  load(scenario: ReplayScenario, mode: ReplayMode): void {
    this.stopTimer();
    this.scenario.set(scenario);
    this.appended.set([]);
    if (mode === 'instant') {
      this.shown.set(scenario.lines.length);
      return;
    }
    this.shown.set(0);
    this.startTimer();
  }

  /** Restart the loaded scenario as a timed line-by-line stream. */
  replayStreamed(): void {
    const scenario = this.scenario();
    if (scenario !== null) {
      this.load(scenario, 'stream');
    }
  }

  /** Skip ahead: show the complete transcript immediately. */
  showAll(): void {
    const scenario = this.scenario();
    if (scenario !== null) {
      this.stopTimer();
      this.shown.set(scenario.lines.length);
    }
  }

  /** Clear the pane (keeps the scenario loaded for a fresh replay). */
  clear(): void {
    this.stopTimer();
    this.shown.set(0);
    this.appended.set([]);
  }

  /** Composer submit during a replay: a real `user`-stream line. */
  appendUserLine(text: string): void {
    this.appended.update((list) => [
      ...list,
      { timestamp: new Date().toISOString(), stream: 'user', text },
    ]);
  }

  private startTimer(): void {
    this.playing.set(true);
    this.timer = setInterval(() => {
      const scenario = this.scenario();
      if (scenario === null || this.shown() >= scenario.lines.length) {
        this.stopTimer();
        return;
      }
      this.shown.update((n) => n + 1);
      if (this.shown() >= scenario.lines.length) {
        this.stopTimer();
      }
    }, STREAM_INTERVAL_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.playing.set(false);
  }

  /** Minimal single-run timeline when the scenario ships none (mirrors live mode). */
  private stubTimeline(scenario: ReplayScenario, lines: readonly CliOutputLine[]): RunTimelineLite {
    const stub: RunInfoLite = {
      index: 1,
      intent: 'start',
      startedAt: lines[0].timestamp,
      status: this.playing() ? 'running' : 'unknown',
      cli: 'claude',
      exitCode: null,
      durationSeconds: null,
      capturedSessionId: `lab-${scenario.id}`,
      lineStart: 1,
      lineEnd: null,
    };
    return { runCount: 1, runs: [stub] };
  }

  private stubTask(scenario: ReplayScenario): TaskInfoLite {
    return { id: scenario.id, title: scenario.title, state: '3-progress' };
  }
}
