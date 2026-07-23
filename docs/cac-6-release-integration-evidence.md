# CAC-6 release and integration evidence

Audit date: 2026-07-23

## Package identity

- Prepared patch release: `coding-agent-chat@0.2.2`
- Source commit used for the local release payload:
  `b1d5154c8f21`
- Local artifact: `dist/coding-agent-chat-0.2.2.tgz` (generated, ignored
  build output)
- Packed artifact SHA-1: `5590531a57fba9a45368b907f23037f2068072ed`
- Registry state during this audit: npm `latest` is still `0.2.1`; version
  `0.2.2` is not published.

The repository release contract requires an immutable `v0.2.2` tag. The
tagged GitHub workflow rebuilds the exact commit, stamps the release manifest,
and publishes with npm provenance. The local payload is release-candidate
evidence, not evidence of a registry publication.

## Verification completed in this worktree

- Pure core/projection verification: 58 tests passed.
- CAC-6 component verification:
  `chat.component.spec.ts` and `conversation-view.component.spec.ts`, 40 tests
  passed. These cover short and long normal messages without disclosure
  controls, complete Markdown/code rendering, technical disclosures, metadata
  present/absent, legacy turns, copy actions, Escape handling, and focus
  restoration.
- `npm run build`: all seven library entry points built in partial compilation
  mode.
- Release stamping for `0.2.2` / `v0.2.2` / `b1d5154c8f21`: passed.
- `npm run release:verify`: all 26 publishable payload files verified.
- `npm pack ./dist/coding-agent-chat`: generated
  `coding-agent-chat-0.2.2.tgz`.
- `npx ng build conversation-lab`: passed with the existing bundle-budget
  warnings.
- Conversation Lab runtime smoke check returned HTTP 200 for
  `?scenario=turn-metadata&theme=light` and displayed the stamped
  `0.2.2` release identity.
- Current narrow/light runtime capture:
  `.orchestrator/jobs/tasks/000/CAC-6/results/cac-6-current-metadata-light-narrow.png`.
  The committed dark, light/narrow, long-message captures remain under
  `screenshots/`.

The complete Angular library run reached 390 passing tests and one reproducible
failure in the unrelated history-windowing assertion
`project-chat-list.component.spec.ts:292` (an extra `scrollCalls` entry after a
declined "jump to start"). The CAC-6 component suites themselves are green;
this audit did not broaden the card into the history-windowing implementation.

## Publication and Agent Studio integration still required

Publication could not be completed in this environment:

- `npm whoami` returns `E401 Unauthorized`.
- The application owns commit/tag/push transitions, while the authoritative
  publish path requires the immutable `v0.2.2` tag and GitHub trusted
  publishing.

This isolated Coding Agent Chat worktree does not contain the Agent Studio
repository or deployment credentials. Consequently there is no honest
evidence yet for:

1. a published npm `coding-agent-chat@0.2.2`,
2. Agent Studio pinning that released version and updating its lockfile,
3. Agent Studio tests/build plus Orchestrator side-sheet E2E, or
4. a deployed Agent Studio revision/environment.

After the platform publishes `v0.2.2`, Agent Studio must install the exact
released version, run its tests/build and side-sheet E2E, and append the
deployed revision and environment to the associated integration/deployment
record. Until then CAC-6 is locally release-ready but not fully published,
integrated, or deployed.
