import { projectConversation } from 'coding-agent-chat/core';

import { LAB_SCENARIOS, findScenario, type ReplayScenario } from './lab-scenarios';

const replayScenarios = LAB_SCENARIOS.filter((s): s is ReplayScenario => s.kind === 'replay');

describe('lab scenario catalog', () => {
  it('has unique ids and at least one scenario of every kind', () => {
    const ids = LAB_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const kind of ['events', 'replay', 'live'] as const) {
      expect(LAB_SCENARIOS.some((s) => s.kind === kind)).toBe(true);
    }
  });

  it('falls back to the first scenario for unknown ids', () => {
    expect(findScenario('does-not-exist').id).toBe(LAB_SCENARIOS[0].id);
  });

  describe.each(replayScenarios.map((s) => [s.id, s] as const))('replay %s', (_id, scenario) => {
    it('keeps line timestamps ascending', () => {
      const stamps = scenario.lines.map((l) => l.timestamp);
      const sorted = [...stamps].sort();
      expect(stamps).toEqual(sorted);
    });

    it('projects through projectConversation without leaking bookkeeping', () => {
      const events = projectConversation({
        source: `spec:${scenario.id}`,
        lines: [...scenario.lines],
        runTimeline: scenario.runTimeline ?? null,
        task: { id: scenario.id, title: scenario.title, state: '3-progress' },
      });
      expect(events.length).toBeGreaterThan(0);
      // `[taskboard]` markers are run bookkeeping and must never surface as text.
      const bodies = events.map((e) => JSON.stringify(e));
      expect(bodies.some((b) => b.includes('[taskboard]'))).toBe(false);
    });
  });

  it('gives every live scenario a non-empty preset prompt', () => {
    for (const scenario of LAB_SCENARIOS) {
      if (scenario.kind === 'live') {
        expect(scenario.prompt.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
