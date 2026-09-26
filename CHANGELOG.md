# Changelog

All notable changes to **coding-agent-chat** are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/). Releases are cut by
pushing a `v<version>` tag (`scripts/release.sh <version>`), which the
`release` workflow builds and publishes to npm. The latest published version is
[0.4.1](https://www.npmjs.com/package/coding-agent-chat/v/0.4.1).

## [Unreleased]

### Added

- Typed, optional per-turn provider, model, mode, effort, token, cost, timing,
  session, thread, and execution-host metadata for both conversation surfaces.
  Hosts declare reportable fields per mode; the UI filters absent or unsupported
  facts, shows an accessible turn line and session summary, and supports a
  library opt-out plus a per-user toggle input. The Conversation Lab includes
  full and partial metadata examples.

- A versioned Codex/Claude/Gemini frame compatibility corpus, documented
  deviation matrix, capture-backed rendering regression tier, and Conversation
  Lab replays now make CLI protocol differences explicit.
- Raw protocol drift now emits the public typed `system.unknownFrame` event
  with frame kind, CLI, exact CLI version, transport, and Trace range; the
  stock renderer surfaces it as a distinct warning row.
- The next library release adds `workPhase` and `runtime.notice` conversation
  kinds. Structured Codex command bursts now absorb surrounding `item.*`
  lifecycle frames, aggregate calls/failures/files in one collapsed phase, and
  retain raw frame evidence in Trace.
- Codex `todo_list` snapshots now project to one stable per-run
  `plan.update` entry rendered by the live checklist component.
- Consecutive non-terminal `supervisor.wait` events now render as one compact,
  default-collapsed group with quiet/resumed counts, longest-silence budget
  context, a time range, and full per-event disclosure. Watchdog kills and
  timeouts remain separate high-signal alert rows.

### Fixed

- Typed code, diff, JSON, and HTML-file payloads in the conversation view now
  reuse the Markdown syntax highlighter, including line-level addition,
  deletion, and hunk-header styling for visual diffs.
- Codex `file_change` started/completed metadata no longer renders as standalone
  rows; paired frames enrich their owning work phase, orphan frames degrade to
  one compact trace-backed notice, and no-action runtime frames stay trace-only.
- Focused conversation viewports now contain vertical navigation keys so they
  scroll only the chat, while composer arrows retain native editing behavior;
  embedding hosts no longer receive those handled key events.

## [0.4.1] - 2026-08-10

### Changed

- The local release preflight now builds the library before running the same
  all-project Angular spec suite as the release workflow, preventing stale
  `dist/` entry points from reaching a tag.

### Fixed

- Tooltip directive specs now perform initial change detection explicitly and
  start with clean singleton DOM, avoiding a suite-load scheduling failure.

## [0.4.0] - 2026-08-08

### Added

- `<cac-chat>` now accepts host-owned `contextAttachments` and emits add/remove
  requests for its context chip row without interpreting paths or content.
- The public website demonstrates functional context attachment add/remove state.
- Capture-backed, opt-in `MachineBound` rendering fixtures now cover Claude,
  Codex, and Gemini across source, git diff, HTML files, Markdown, image
  references, JSON, logs, long lines, mixed turns, tables, Mermaid, and ANSI.

### Changed

- Composer Send and image attachment actions now live in the always-visible
  footer, with Send as the final right-aligned action.

### Fixed

- Codex JSONL agent messages now project renderer-safe typed content payloads,
  and raw source, diff, HTML, JSON, and log bodies bypass Markdown parsing.

## [0.3.2] - 2026-07-24

### Fixed

- Structured short answers remain fully visible, while messages over 40 source
  lines or 3000 characters collapse behind a per-message control whose expanded
  state survives component remounts for the browser session.

## [0.3.1] - 2026-07-24

### Fixed

- Conversation auto-follow releases when the user scrolls up and only
  re-engages at the bottom; jump-to-latest works again and composer input no
  longer fights the scroll position (stick-to-bottom rewrite).

## [0.3.0] - 2026-07-24

### Added

- Composer context is now a first-class input on the conversation view, so hosts can bind and restore it without side channels.
- Attachment contract: durable storage plus resolvable references for pasted images.

- Conversation Lab now includes a dedicated immutable turn-provenance fixture
  for dark, light, narrow, copy-action, and technical-detail checks.

### Fixed

- Normal `<cac-conversation-view>` messages now render every coalesced item and
  every Markdown/code line in full. Message bodies no longer clamp, expose
  expand/show-more controls, or create nested code-block scrolling.
- The turn-details popover now has stable accessible relationships, closes on
  Escape, and restores focus to its trigger.
- Built release identity now reports the package version consistently, and the
  release stamper enforces that version alongside tag/commit/timestamp.

## [0.2.1] - 2026-07-17

### Added

- `<cac-chat>` now keeps normal conversation turns fully visible while exposing
  compact immutable turn provenance and a separate details popover for
  technical metadata when the host supplies it.

### Fixed

- Remove recognized timestamp, speaker, supervisor, routing, status, and
  protocol envelopes from assistant text before it reaches the conversation
  renderer, while preserving legitimate prose and fenced code.
- Apply the same normalization to projected live output and replayed turns,
  retain stripped source frames as structured diagnostics, and avoid
  resurrecting envelope-only streaming frames through fallback text.
- Chat component tests now compile under the Angular unit-test builder by
  avoiding an untyped `querySelectorAll<T>()` call in the spec.

## [0.2.0] - 2026-07-10

### Added

- **Inline reference renderers — a host-provided extension point.** The
  conversation view (and every `<cac-markdown>` surface) can now slot live host
  components in place of matched tokens in message prose — task keys, ticket
  ids, URLs, `@mentions`. Hosts register matchers through the new
  `INLINE_REFERENCE_RENDERERS` token, or the `inlineReferences` option of
  `provideCodingAgentChat`. The library stays host-agnostic: it owns only the
  matching + slotting, never what a reference means.
  - Markdown-safe: matches inside fenced code blocks, inline code and links are
    left as plain text.
  - Multiple matchers per host, resolved in registration (precedence) order.
  - Named capture groups from the pattern are handed to the slotted component
    alongside the matched token.
  - New pure helpers `findInlineReferenceMatches` / `injectInlineReferenceMarkers`
    exported from `coding-agent-chat/markdown`.

### Unchanged

- **Zero behaviour change and zero cost when no renderer is registered** — the
  extension point is fully inert by default, so existing hosts render message
  text exactly as before.

## 0.1.0

Internal bootstrap — never published to npm; 0.2.0 was the first release.

- Initial bootstrap of the publishable Angular library carved out of the
  Agent Studio frontend: `<cac-conversation-view>`, `<cac-chat>`,
  `<cac-markdown>`, `<cac-project-chat-list>`, the `core` wire contract, the
  studio theme, and the `provideCodingAgentChat()` host-wiring helper.

[unreleased]: https://github.com/agent-orc/chat/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/agent-orc/chat/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/agent-orc/chat/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/agent-orc/chat/releases/tag/v0.3.2
[0.3.1]: https://github.com/agent-orc/chat/releases/tag/v0.3.1
[0.3.0]: https://github.com/agent-orc/chat/releases/tag/v0.3.0
[0.2.1]: https://www.npmjs.com/package/coding-agent-chat/v/0.2.1
[0.2.0]: https://www.npmjs.com/package/coding-agent-chat/v/0.2.0
