/**
 * Unit specs for resolveRole's deterministic resolution order (roleId >
 * refs > author/kind heuristics > agent-generic) and the getRole lookup.
 */
import { describe, expect, it } from 'vitest';

import { getRole, resolveRole, ROLE_CATALOGUE, type WorkforceRoleId } from './workforce-role';

describe('resolveRole', () => {
  it('lets an explicit roleId win over author, kind, and refs', () => {
    const role = resolveRole({
      roleId: 'security-auditor',
      author: 'user',
      kind: 'event-decision',
      refs: ['aspect:code-quality'],
    });
    expect(role.id).toBe('security-auditor');
  });

  it('maps aspect refs onto their workforce roles', () => {
    const expected: ReadonlyArray<[string, WorkforceRoleId]> = [
      ['aspect:code-quality', 'code-reviewer'],
      ['aspect:requirement-fit', 'plan-curator'],
      ['aspect:documentation-impact', 'documentation-maintainer'],
      ['aspect:tests-and-evidence', 'test-author'],
    ];
    for (const [ref, roleId] of expected) {
      expect(resolveRole({ author: 'agent', refs: [ref] }).id).toBe(roleId);
    }
  });

  it('resolves explicit role refs against the catalogue, case-insensitively in the id part', () => {
    expect(resolveRole({ refs: ['role:supervisor'] }).id).toBe('supervisor');
    expect(resolveRole({ refs: ['  role:Diagnostician  '] }).id).toBe('diagnostician');
  });

  it('ignores unknown refs and falls back to the author heuristics', () => {
    const role = resolveRole({
      author: 'orchestrator',
      refs: ['aspect:nonexistent-aspect', 'role:not-a-role', ''],
    });
    expect(role.id).toBe('orchestrator');
  });

  it('maps wire authors deterministically (user / orchestrator / supervisor / system)', () => {
    expect(resolveRole({ author: 'user' }).id).toBe('user');
    expect(resolveRole({ author: 'orchestrator' }).id).toBe('orchestrator');
    expect(resolveRole({ author: 'supervisor' }).id).toBe('supervisor');
    // System messages are attributed to the orchestrator on purpose.
    expect(resolveRole({ author: 'system' }).id).toBe('orchestrator');
    // Author matching is case-insensitive.
    expect(resolveRole({ author: 'Orchestrator' }).id).toBe('orchestrator');
  });

  it('lands CLI-typed agents and the bare agent author on the Task Executor', () => {
    for (const author of ['agent', 'claude', 'codex', 'gemini', 'Claude']) {
      expect(resolveRole({ author }).id).toBe('task-executor');
    }
  });

  it('derives roles from event kinds when the author is generic', () => {
    expect(resolveRole({ author: 'somebody', kind: 'event-decision' }).id).toBe('orchestrator');
    expect(resolveRole({ author: 'somebody', kind: 'decision.orchestrator' }).id).toBe('orchestrator');
    expect(resolveRole({ author: 'somebody', kind: 'event-watchdog' }).id).toBe('health-officer');
    expect(resolveRole({ author: 'somebody', kind: 'supervisor.wait' }).id).toBe('health-officer');
  });

  it('falls back to agent-generic for unknown or empty input and never returns null', () => {
    expect(resolveRole({}).id).toBe('agent-generic');
    expect(resolveRole({ author: 'mystery-bot', kind: 'event-unknown' }).id).toBe('agent-generic');
    expect(resolveRole({ author: null, kind: null, refs: null }).id).toBe('agent-generic');
  });
});

describe('getRole', () => {
  it('returns the catalogue entry for a known id', () => {
    const role = getRole('code-reviewer');
    expect(role.label).toBe('Code Reviewer');
    expect(ROLE_CATALOGUE).toContain(role);
  });
});
