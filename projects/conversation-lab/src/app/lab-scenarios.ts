/**
 * Scenario catalog for the Conversation Lab — the single place to exercise the
 * library against every interesting transcript shape.
 *
 * Three scenario kinds:
 *
 * - `replay`  — a scripted `CliOutputLine[]` feed played through the SAME
 *   projection (`projectConversation`) the live workbench mode uses. This
 *   tests the real pipeline (activity-log parse → events → renderer), not
 *   hand-built events, and can be streamed line-by-line to simulate a live
 *   session without a backend.
 * - `live`    — a preset prompt for a REAL CLI run via the workbench host
 *   (`workbench/`, port 5055). Each preset is a reproducible starting point
 *   that provokes a specific event shape (tool rows, failures, todo plans).
 * - `events`  — hand-built `ConversationEvent[]` fixtures for renderer-only
 *   rows the projection cannot synthesize from short scripts (durable image
 *   artifacts, orchestrator decisions with retry budgets, token metrics).
 *
 * All replay scripts use a fixed timestamp base so replays are deterministic
 * across reloads.
 */

import type {
  CliOutputLine,
  ConversationEvent,
  RunInfoLite,
  RunTimelineLite,
} from '@coding-agent/chat/core';

import { LAB_CONVERSATION_EVENTS } from './lab-fixtures';

export type LabScenarioKind = 'events' | 'replay' | 'live';
export type LiveCliType = 'claude' | 'codex' | 'gemini';

interface LabScenarioBase {
  id: string;
  title: string;
  /** One or two sentences: what the scenario provokes and what to look for. */
  description: string;
}

/** Hand-built ConversationEvents rendered directly (renderer showcase). */
export interface EventsScenario extends LabScenarioBase {
  kind: 'events';
  events: readonly ConversationEvent[];
}

/** Scripted raw lines replayed through `projectConversation`. */
export interface ReplayScenario extends LabScenarioBase {
  kind: 'replay';
  lines: readonly CliOutputLine[];
  /** Optional real run timeline so the projection emits run markers. */
  runTimeline?: RunTimelineLite;
}

/** Preset prompt for a real CLI session via the workbench host. */
export interface LiveScenario extends LabScenarioBase {
  kind: 'live';
  prompt: string;
  /** Preferred CLI; the user can still override it in the live bar. */
  cliType?: LiveCliType;
  /** Suggested follow-up message — exercises the resume-session chain. */
  followUp?: string;
}

export type LabScenario = EventsScenario | ReplayScenario | LiveScenario;

// ── Script builder ────────────────────────────────────────────────────────────

type ScriptEntry = readonly [text: string, stream?: string];

/** Fixed base (2026-07-01T09:00Z) + 2s steps: deterministic, ordered lines. */
function script(entries: readonly ScriptEntry[], stepSeconds = 2): CliOutputLine[] {
  const base = Date.UTC(2026, 6, 1, 9, 0, 0);
  return entries.map(([text, stream], index) => ({
    timestamp: new Date(base + index * stepSeconds * 1000).toISOString(),
    stream: stream ?? 'stdout',
    text,
  }));
}

function run(partial: Partial<RunInfoLite> & Pick<RunInfoLite, 'index' | 'lineStart' | 'lineEnd'>): RunInfoLite {
  return {
    intent: 'start',
    startedAt: '2026-07-01T09:00:00.000Z',
    status: 'completed',
    cli: 'claude',
    exitCode: 0,
    durationSeconds: 120,
    capturedSessionId: null,
    ...partial,
  };
}

// ── Replay scripts ────────────────────────────────────────────────────────────

const happyPathLines = script([
  ['Bitte ergänze einen Dark/Light-Umschalter auf der Settings-Seite und decke ihn mit einem Spec ab.', 'user'],
  ['[taskboard] Started claude CLI (PID 4711), model=claude-fable-5, thinkingLevel=high, session=lab-sess-1', 'system'],
  ['Ich schaue mir zuerst das Settings-Modul und den bestehenden Theme-Service an.'],
  ['* Read settings.component.ts'],
  ['  | src/app/settings/settings.component.ts'],
  ['* Read theme.service.ts'],
  ['  | src/app/theme/theme.service.ts'],
  ['* Search "data-studio-theme"'],
  ['  | 6 Treffer in 3 Dateien'],
  ['* Edit settings.component.ts'],
  ['  | Umschalter + Persistenz ergänzt'],
  ['* Run npx vitest run settings (shell)'],
  ['  | ✓ settings.component.spec.ts (4 Tests) 312ms'],
  ['Der Umschalter ist verdrahtet: er flippt `data-studio-theme` auf dem Dokument-Root und persistiert die Wahl.'],
  [''],
  ['Alle vier Tests laufen grün.'],
]);

const testFailRetryLines = script([
  ['Führe die Playwright-Suite aus und fixe, was rot ist.', 'user'],
  ['[taskboard] Started claude CLI (PID 4712), model=claude-fable-5, thinkingLevel=high', 'system'],
  ['* Run npx playwright test perf-frontend.spec.ts (shell)'],
  ['  | running playwright tests'],
  ['x Run npx playwright test perf-frontend.spec.ts (shell): exited with error 1'],
  ['  | grouped jobs poll took 11521 ms', 'stderr'],
  ['Der Poll-Timeout ist zu knapp — ich erhöhe das Budget und versuche es erneut.'],
  ['* Edit perf-frontend.spec.ts'],
  ['  | Timeout 10s → 30s'],
  ['* Run npx playwright test perf-frontend.spec.ts (shell)'],
  ['  | passed in 320ms'],
  ['Suite ist grün: der fehlgeschlagene Lauf war ein zu enges Poll-Budget, kein Produktfehler.'],
]);

const watchdogWaitLines = script([
  ['Analysiere das gesamte Log-Verzeichnis und fasse die Fehlerklassen zusammen.', 'user'],
  ['[taskboard] Started claude CLI (PID 4713), model=claude-fable-5, thinkingLevel=high', 'system'],
  ['* Read logs/2026-06-30.log'],
  ['  | 48.000 Zeilen'],
  ['[watchdog] Agent has been quiet for 30s', 'orchestrator'],
  ['[watchdog] Still silent at 60s', 'orchestrator'],
  ['[watchdog] Still silent at 120s', 'orchestrator'],
  ['[watchdog] Agent resumed streaming', 'orchestrator'],
  ['Die lange Stille war das Einlesen des 48k-Zeilen-Logs — hier die drei dominanten Fehlerklassen.'],
]);

const watchdogKillLines = script([
  ['Starte die Migration und warte auf das Ergebnis.', 'user'],
  ['[taskboard] Started claude CLI (PID 4714), model=claude-fable-5, thinkingLevel=high', 'system'],
  ['* Run npm run migrate (shell)'],
  ['  | applying 14 migrations'],
  ['[watchdog] Agent has been quiet for 300s', 'orchestrator'],
  ['[watchdog] Killed after 600s of silence', 'orchestrator'],
  ['Run failed: watchdog kill after 600s of silence', 'stderr'],
]);

const needsInputLines = script([
  ['Baue den Recovery-Test für den CLI-Wrapper.', 'user'],
  ['[taskboard] Started claude CLI (PID 4715), model=claude-fable-5, thinkingLevel=high', 'system'],
  ['* Read cli-wrapper.ts'],
  ['  | src/runner/cli-wrapper.ts'],
  ['[[TASK_NEEDS_INPUT: which CLI should I target for the recovery test?]]', 'orchestrator'],
  ['[reissue] retrying because evidence was incomplete', 'orchestrator'],
]);

const modelSwitchLines = script([
  ['Implementiere das Model-Badge im Conversation-Header.', 'user'],
  ['[taskboard] Started codex CLI (PID 11), model=gpt-5-codex, thinkingLevel=high', 'system'],
  ['Erster Anlauf auf dem Startmodell — ich lege das Badge-Markup an.'],
  ['[taskboard] Started claude CLI (PID 22), model=claude-fable-5, thinkingLevel=high', 'system'],
  ['Recovery-Lauf auf dem gewechselten Modell — Badge liest jetzt das per-Run-Modell.'],
]);

const stderrCrashLines = script([
  ['Starte den Dev-Server und prüfe die Startseite.', 'user'],
  ['[taskboard] Started claude CLI (PID 4716), model=claude-fable-5, thinkingLevel=high', 'system'],
  ['* Run npm run dev (shell)'],
  ['  | starting dev server'],
  ["Error: Cannot find module 'esbuild'", 'stderr'],
  ['    at Function.Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)', 'stderr'],
  ['Run failed: process exited with code 1', 'stderr'],
]);

/** ~120 Zeilen: 10 Arbeitsblöcke für Scroll-/Fold-/Performance-Checks. */
function longRunLines(): CliOutputLine[] {
  const entries: ScriptEntry[] = [
    ['Refaktoriere alle zehn Feature-Module auf standalone Components.', 'user'],
    ['[taskboard] Started claude CLI (PID 4717), model=claude-fable-5, thinkingLevel=high', 'system'],
  ];
  for (let block = 1; block <= 10; block += 1) {
    entries.push(
      [`Modul ${block}/10: feature-${block} umstellen.`],
      [`* Read feature-${block}.module.ts`],
      [`  | src/app/feature-${block}/feature-${block}.module.ts`],
      [`* Search "feature-${block}" Verwendungen`],
      [`  | ${3 + (block % 4)} Treffer`],
      [`* Edit feature-${block}.component.ts`],
      ['  | standalone: true, imports gehoben'],
      [`* Run npx vitest run feature-${block} (shell)`],
      [`  | ✓ feature-${block}.component.spec.ts (${2 + (block % 3)} Tests)`],
      [`Modul feature-${block} fertig — Tests grün.`],
      [''],
    );
  }
  entries.push(['Alle zehn Module sind standalone; die Gesamtsuite läuft grün.']);
  return script(entries, 1);
}

/** Claude-style TodoWrite plan: one list, re-emitted (a full snapshot) after
 *  each step, so the checklist ticks items off in place. The `* Todo …` lines
 *  match the workbench's PlanUpdated mapping, so replay == live. */
const todoPlanLines = script([
  ['Baue ein kleines CLI-Tool: Argument-Parsing, Hilfe-Text, Tests und README.', 'user'],
  ['[taskboard] Started claude CLI (PID 5001), model=claude-sonnet-5, thinkingLevel=high', 'system'],
  ['Ich lege zuerst einen Plan an und arbeite ihn dann Punkt für Punkt ab.'],
  ['* Todo [in_progress] Argument-Parsing implementieren; [pending] Hilfe-Text ergänzen; [pending] Tests schreiben; [pending] README verfassen'],
  ['* Edit src/cli.ts'],
  ['  | argv-Parsing mit Flags -h/--help ergänzt'],
  ['* Todo [completed] Argument-Parsing implementieren; [in_progress] Hilfe-Text ergänzen; [pending] Tests schreiben; [pending] README verfassen'],
  ['* Edit src/help.ts'],
  ['  | Hilfe-Text mit Beispielen'],
  ['* Todo [completed] Argument-Parsing implementieren; [completed] Hilfe-Text ergänzen; [in_progress] Tests schreiben; [pending] README verfassen'],
  ['* Run npx vitest run (shell)'],
  ['  | ✓ 6 Tests grün'],
  ['* Todo [completed] Argument-Parsing implementieren; [completed] Hilfe-Text ergänzen; [completed] Tests schreiben; [in_progress] README verfassen'],
  ['* Edit README.md'],
  ['  | Nutzung + Beispiele dokumentiert'],
  ['* Todo [completed] Argument-Parsing implementieren; [completed] Hilfe-Text ergänzen; [completed] Tests schreiben; [completed] README verfassen'],
  ['Alle vier Punkte erledigt: Parsing, Hilfe, Tests grün, README steht.'],
]);

// ── Catalog ───────────────────────────────────────────────────────────────────

export const LAB_SCENARIOS: readonly LabScenario[] = [
  {
    id: 'showcase',
    kind: 'events',
    title: 'Showcase (Fixtures)',
    description:
      'Handgebaute ConversationEvents: Message-Gruppen, Tool-Burst, Bild-Artefakte (durable + scratch), Orchestrator-Entscheidung mit Retry-Budget, Token-Metrik, Run-Marker.',
    events: LAB_CONVERSATION_EVENTS,
  },
  {
    id: 'happy-path',
    kind: 'replay',
    title: 'Feature-Auftrag (Happy Path)',
    description:
      'User-Auftrag → Tool-Burst (Read/Search/Edit) → grüner Testlauf → Agent-Zusammenfassung. Der [taskboard]-Marker setzt das Modell und verschwindet selbst aus dem Chat.',
    lines: happyPathLines,
    runTimeline: {
      runCount: 1,
      runs: [run({ index: 1, lineStart: 1, lineEnd: happyPathLines.length, capturedSessionId: 'lab-sess-1', durationSeconds: 210 })],
    },
  },
  {
    id: 'test-fail-retry',
    kind: 'replay',
    title: 'Test schlägt fehl + Retry',
    description:
      'Ein fehlgeschlagener Testlauf (x-Zeile + stderr) gefolgt von Fix und grünem Wiederholungslauf — stresst das tests-Aggregat im Tool-Burst und die Fehlerzeile.',
    lines: testFailRetryLines,
  },
  {
    id: 'watchdog-wait',
    kind: 'replay',
    title: 'Watchdog: Wait-Loop',
    description:
      'Agent wird still, der Watchdog meldet sich mehrfach, dann Wiederaufnahme — der kanonische "wait loop" aus den Edge-Cases.',
    lines: watchdogWaitLines,
  },
  {
    id: 'watchdog-kill',
    kind: 'replay',
    title: 'Watchdog: Kill nach Stille',
    description: 'Lauf wird nach 600s Stille gekillt; der Abbruch erscheint als Fehlerzeile.',
    lines: watchdogKillLines,
  },
  {
    id: 'needs-input',
    kind: 'replay',
    title: 'Needs Input + Reissue',
    description:
      'Agent fordert per NEEDS_INPUT-Sentinel eine Rückfrage an; der Orchestrator reissued. Prüft die orchestrator-Zeilenklassifikation.',
    lines: needsInputLines,
  },
  {
    id: 'model-switch',
    kind: 'replay',
    title: 'Modellwechsel über zwei Runs',
    description:
      'Zwei Runs mit unterschiedlichen Modellen (codex → claude). Jede Agent-Ausgabe muss das Modell IHRES Runs tragen; der Run-Marker zeigt den Wechsel.',
    lines: modelSwitchLines,
    runTimeline: {
      runCount: 2,
      runs: [
        run({ index: 1, lineStart: 1, lineEnd: 3, cli: 'codex', capturedSessionId: 'sess-one', durationSeconds: 60 }),
        run({ index: 2, intent: 'recovery', startedAt: '2026-07-01T09:00:06.000Z', lineStart: 4, lineEnd: 5, capturedSessionId: 'sess-two', durationSeconds: 45 }),
      ],
    },
  },
  {
    id: 'stderr-crash',
    kind: 'replay',
    title: 'Crash mit stderr',
    description:
      'Prozess stirbt hart: Node-Stacktrace auf stderr plus "Run failed". Prüft Fehlerzeilen-Rendering ohne jeden Erfolgs-Kontext.',
    lines: stderrCrashLines,
  },
  {
    id: 'long-run',
    kind: 'replay',
    title: 'Langer Lauf (10 Blöcke)',
    description:
      '~120 Zeilen über zehn Arbeitsblöcke — für Scroll-Verhalten, Tool-Burst-Faltung und Rendering-Performance. Gestreamt abgespielt simuliert das eine echte lange Session.',
    lines: longRunLines(),
  },
  {
    id: 'todo-plan',
    kind: 'replay',
    title: 'Todo-Plan (abgehakt)',
    description:
      'Claude-Stil TodoWrite: ein 4-Punkte-Plan wird angelegt und Schritt für Schritt abgehakt. Alle Snapshots bündeln sich zu EINER Checkliste, die sich in place aktualisiert — gestreamt abspielen, um das Abhaken live zu sehen.',
    lines: todoPlanLines,
  },
  {
    id: 'live-smoke',
    kind: 'live',
    title: 'Live: Smoke-Test',
    description:
      'Harmloser Prompt ohne Tool-Einsatz — prüft die Kette Workbench → CLI → SSE → Projektion. Erwartung: eine reine Agent-Textantwort.',
    prompt: 'Antworte nur mit einer kurzen Begrüßung und nenne dein aktuelles Arbeitsverzeichnis. Benutze keine Tools.',
  },
  {
    id: 'live-write-file',
    kind: 'live',
    title: 'Live: Datei anlegen',
    description:
      'Der Agent schreibt eine Datei in die Workbench-Sandbox. Erwartung: eine Write-Tool-Zeile im Burst plus kurze Bestätigung.',
    prompt: "Lege im Arbeitsverzeichnis eine Datei hello.md mit genau einer Zeile 'Hallo aus der Workbench-Sandbox' an und bestätige kurz.",
    followUp: 'Lies hello.md und hänge eine zweite Zeile mit dem heutigen Datum an.',
  },
  {
    id: 'live-fail-command',
    kind: 'live',
    title: 'Live: Fehlschlagender Befehl',
    description:
      'Der Agent führt bewusst einen fehlschlagenden Shell-Befehl aus. Erwartung: eine rote x-Zeile (Tool-Fehler) und eine Erklärung.',
    prompt: "Führe im Arbeitsverzeichnis den Shell-Befehl `node -e \"process.exit(1)\"` aus, berichte den Exit-Code und erkläre in einem Satz, was passiert ist.",
  },
  {
    id: 'live-todo-plan',
    kind: 'live',
    title: 'Live: Todo-Plan',
    description:
      'Zwingt Claude, sein TodoWrite-Werkzeug zu nutzen: der Plan (PlanUpdated) wird als Live-Checkliste gerendert, die sich abhakt, während die Punkte erledigt werden.',
    prompt:
      'Nutze unbedingt dein TodoWrite-Werkzeug: lege zu Beginn einen Plan mit vier Punkten an, um im Arbeitsverzeichnis eine kleine README.md (Titel, kurze Beschreibung, ein Nutzungsbeispiel, eine Lizenzzeile) zu erstellen. Aktualisiere die Todo-Liste nach jedem Punkt (in_progress → completed) und erledige dann alle Punkte.',
  },
];

export function findScenario(id: string): LabScenario {
  return LAB_SCENARIOS.find((s) => s.id === id) ?? LAB_SCENARIOS[0];
}
