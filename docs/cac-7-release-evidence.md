# CAC-7 release and integration evidence

Audit date: 2026-07-17

## Package identity

- Prepared patch release: `coding-agent-chat@0.2.1`
- Local artifact: `dist/coding-agent-chat-0.2.1.tgz` (generated, ignored build output)
- Local manifest verification: `Verified coding-agent-chat@0.2.1: 26 files`
- Registry state during the audit: `latest` was `0.2.0`, published on
  2026-07-11 from git commit `9042f1a54804d0874424c8a8a923bef30f10ea5c`.
- The published commit predates the CAC-7 parser changes and does not contain
  `normalizeVisibleChatBody` diagnostics. It is therefore not deployment
  evidence for this fix and must not be reused as the corrected release.

The release workflow must create immutable tag `v0.2.1` from the final
committed source. It will rebuild and stamp the authoritative commit and build
timestamp into `release-manifest.json` before publishing with npm provenance.

## Verification completed in this worktree

- `npm test`: 7 files and 173 tests passed.
- `npm run build`: all seven library entry points built.
- `node scripts/stamp-release.mjs ... --version 0.2.1 --tag v0.2.1`: local
  pre-release manifest generated successfully.
- `npm run release:verify`: all 26 publishable payload files verified.
- `npm run pack`: `coding-agent-chat-0.2.1.tgz` generated.
- `npx ng build conversation-lab`: passed (existing bundle-budget warnings).
- `npx ng build website`: passed and prerendered two routes.

## Integration still required

This isolated CAC worktree does not contain the Agent Studio repository or
deployment credentials. After `0.2.1` is published, Agent Studio must pin the
released artifact, run its tests/build, verify the Orchestrator side sheet
against the captured envelope fixtures, and record the deployed revision and
environment here (or in the associated deployment record).

Until those steps have evidence, CAC-7 is locally release-ready but not fully
deployed or integration-verified.
