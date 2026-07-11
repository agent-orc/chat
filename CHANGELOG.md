# Changelog

All notable changes to **coding-agent-chat** are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/). Releases are cut by
pushing a `v<version>` tag (`scripts/release.sh <version>`), which the
`release` workflow builds and publishes to npm.

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

## [0.1.0]

- Initial bootstrap of the publishable Angular library carved out of the
  agent-taskboard frontend: `<cac-conversation-view>`, `<cac-chat>`,
  `<cac-markdown>`, `<cac-project-chat-list>`, the `core` wire contract, the
  studio theme, and the `provideCodingAgentChat()` host-wiring helper.

[0.2.0]: https://github.com/agent-orc/chat/releases/tag/v0.2.0
[0.1.0]: https://github.com/agent-orc/chat/releases/tag/v0.1.0
