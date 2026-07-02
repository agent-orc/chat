/**
 * Unit specs for the phase grouping helpers: user-anchored groupIntoPhases
 * (leading phase, participant dedup, summaries) and idle-gap super-phases.
 */
import { describe, expect, it } from 'vitest';

import { groupIntoPhases, groupIntoSuperPhases, type PhaseInputMessage } from './chat-phase';

/** ISO timestamp at 2026-01-01 10:<min>:<sec> UTC. */
const at = (min: number, sec = 0): string =>
  new Date(Date.UTC(2026, 0, 1, 10, min, sec)).toISOString();

const msg = (
  id: string,
  ts: string,
  author: string,
  extra?: Partial<PhaseInputMessage>
): PhaseInputMessage => ({ id, ts, author, ...extra });

describe('groupIntoPhases', () => {
  it('returns an empty list for an empty message window', () => {
    expect(groupIntoPhases([])).toEqual([]);
  });

  it('groups leading non-user messages into an implicit "before you spoke" phase', () => {
    const phases = groupIntoPhases([
      msg('a1', at(0), 'agent'),
      msg('o1', at(1), 'orchestrator'),
    ]);
    expect(phases).toHaveLength(1);
    expect(phases[0].id).toBe('phase-a1');
    expect(phases[0].hasUser).toBe(false);
    expect(phases[0].messageIds).toEqual(['a1', 'o1']);
    expect(phases[0].participants.map((r) => r.id)).toEqual(['task-executor', 'orchestrator']);
    expect(phases[0].summary).toBe('Task Executor and Orchestrator responded (2 messages).');
  });

  it('starts a new phase at every user turn and tracks start/end timestamps', () => {
    const phases = groupIntoPhases([
      msg('a1', at(0), 'agent'),
      msg('u1', at(1), 'user'),
      msg('a2', at(2), 'agent'),
      msg('a3', at(3), 'agent'),
      msg('u2', at(4), 'user'),
      msg('a4', at(5), 'agent'),
    ]);
    expect(phases.map((p) => p.messageIds)).toEqual([['a1'], ['u1', 'a2', 'a3'], ['u2', 'a4']]);
    expect(phases.map((p) => p.id)).toEqual(['phase-a1', 'phase-u1', 'phase-u2']);
    expect(phases.map((p) => p.hasUser)).toEqual([false, true, true]);
    expect(phases[1].startTs).toBe(at(1));
    expect(phases[1].endTs).toBe(at(3));
    expect(phases.map((p) => p.messageCount)).toEqual([1, 3, 2]);
  });

  it('deduplicates participants in first-seen order (claude and codex are both the executor)', () => {
    const phases = groupIntoPhases([
      msg('u1', at(0), 'user'),
      msg('c1', at(1), 'claude'),
      msg('x1', at(2), 'codex'),
      msg('o1', at(3), 'orchestrator'),
    ]);
    expect(phases).toHaveLength(1);
    expect(phases[0].participants.map((r) => r.id)).toEqual(['user', 'task-executor', 'orchestrator']);
    expect(phases[0].summary).toBe('You steered; Task Executor and Orchestrator responded (4 messages).');
  });

  it('summarises a user-only phase without a workforce chain', () => {
    const phases = groupIntoPhases([msg('u1', at(0), 'user')]);
    expect(phases[0].summary).toBe('You opened the conversation (1 message).');
  });

  it('honours pre-resolved roleIds and aspect refs when attributing participants', () => {
    const phases = groupIntoPhases([
      msg('r1', at(0), 'agent', { roleId: 'code-reviewer' }),
      msg('p1', at(1), 'agent', { refs: ['aspect:requirement-fit'] }),
    ]);
    expect(phases[0].participants.map((r) => r.id)).toEqual(['code-reviewer', 'plan-curator']);
  });
});

describe('groupIntoSuperPhases', () => {
  const contiguousPhases = () =>
    groupIntoPhases([
      msg('u1', at(0), 'user'),
      msg('a1', at(1), 'agent'),
      msg('u2', at(5), 'user'),
      msg('o1', at(6), 'orchestrator'),
    ]);

  it('returns an empty list for no phases', () => {
    expect(groupIntoSuperPhases([])).toEqual([]);
  });

  it('collapses contiguous phases (gaps below the boundary) into one super-phase', () => {
    const supers = groupIntoSuperPhases(contiguousPhases());
    expect(supers).toHaveLength(1);
    expect(supers[0].id).toBe('super-phase-u1');
    expect(supers[0].phases).toHaveLength(2);
    expect(supers[0].messageCount).toBe(4);
    expect(supers[0].startTs).toBe(at(0));
    expect(supers[0].endTs).toBe(at(6));
    // Participant union in first-seen order across contained phases.
    expect(supers[0].participants.map((r) => r.id)).toEqual(['user', 'task-executor', 'orchestrator']);
    expect(supers[0].summary).toBe('2 phases · 4 messages · 6 min');
  });

  it('opens a new super-phase when the idle gap reaches the default 15-minute boundary', () => {
    const phases = groupIntoPhases([
      msg('u1', at(0), 'user'),
      msg('a1', at(1), 'agent'),
      // 24 minutes of idle between a1 (10:01) and u2 (10:25) crosses the boundary.
      msg('u2', at(25), 'user'),
      msg('a2', at(26), 'agent'),
    ]);
    const supers = groupIntoSuperPhases(phases);
    expect(supers).toHaveLength(2);
    expect(supers[0].phases.map((p) => p.id)).toEqual(['phase-u1']);
    expect(supers[1].phases.map((p) => p.id)).toEqual(['phase-u2']);
    expect(supers[1].summary).toBe('1 phase · 2 messages · 1 min');
  });

  it('honours a custom idleBoundaryMs; a gap exactly at the boundary splits', () => {
    const phases = groupIntoPhases([
      msg('u1', at(0), 'user'),
      msg('u2', at(5), 'user'), // exactly 5 minutes after u1's phase ends
    ]);
    const strict = groupIntoSuperPhases(phases, { idleBoundaryMs: 5 * 60 * 1000 });
    expect(strict).toHaveLength(2);
    // Sub-minute super-phase durations render as "< 1 min".
    expect(strict[0].summary).toBe('1 phase · 1 message · < 1 min');

    const lax = groupIntoSuperPhases(phases);
    expect(lax).toHaveLength(1);
  });
});
