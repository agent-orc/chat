# CAC-10 release and integration evidence

Audit date: 2026-07-24

## Local regression evidence

- `npm test`: 10 files and 192 tests passed. The parser/projection cases prove
  the AGT-2176-shaped stderr transcript stays out of `message.taskAgent`,
  remains bounded during streaming/replay, keeps its raw range for Trace, and
  preserves a multi-line final stdout response as one complete turn.
- `npm run build` followed by `npx ng test coding-agent-chat --no-watch`: 34
  files and 395 tests passed. The build-first order is required because the
  component suite deliberately resolves the package's built secondary entry
  points. The canonical conversation component renders one compact technical
  row and the complete stdout reply.
- `npx ng test conversation-lab --no-watch`: 2 files and 33 tests passed. The
  host fixture proves the compact transcript row opens its bounded 1–19 raw
  range in Trace, where the JSDoc source remains plain technical text rather
  than becoming Markdown bullets.
- `npm run build`: all package entry points, including the Node attachment
  storage entry point added by CAC-7, built successfully.
- `npx ng build conversation-lab`: passed with the existing bundle-budget
  warnings.

The compact visual regression is captured in both themes:

- `screenshots/agt-2176-light.png`
- `screenshots/agt-2176-dark.png`

## Targeted operator sweep

The 2026-07-24 completion/evidence sweep reran the locked checkout from a
fresh `npm ci`. The parser/projection suite (192 tests), Coding Agent Chat
component suite (395 tests), Conversation Lab host suite (33 tests), package
build, and host build all passed. The host fixture additionally asserts that
every raw Trace line is emitted through a plain technical `code` element and
never through the Markdown component. Both committed theme captures were
visually checked after the gate run.

## Agent Studio integration follow-up

This Coding Agent Chat worktree does not contain the Agent Studio repository or
its deployment configuration. After the next package release containing this
change, Agent Studio must pin that exact package version, update its lockfile,
and replay AGT-2176 in the task-detail conversation. The host check must confirm
that Trace exposes the raw stderr transcript as preformatted technical output,
the readable conversation contains no JSDoc bullets, and a genuine failed
Codex run still produces a concise system error.

Until that package adoption and deployed-host check are recorded, the local
library/Conversation Lab regression is complete but Agent Studio deployment is
an explicit integration follow-up.
