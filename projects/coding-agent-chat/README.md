# @coding-agent/chat

Best-in-class Angular library for rendering **coding-agent conversations** — the
frontend counterpart to [`coding-agent-runner`](https://github.com/RobertMischke/coding-agent-runner).
The runner produces the server-side event stream; `@coding-agent/chat` renders it
client-side: from raw evidence (CLI output lines, run timeline, tokens, screenshots,
commits) to a fully grouped, progressively-disclosed conversation.

> Status: **early bootstrap.** The public surface is being carved out of the
> agent-taskboard frontend per the extraction plan. APIs are not yet stable.

## Install

```sh
npm install @coding-agent/chat
```

Peer dependencies: `@angular/core`, `@angular/common`, `@angular/forms` (`>=21 <22`)
and `rxjs ~7.8`.

## Entry points

| Import | Contents |
|---|---|
| `@coding-agent/chat` | everything + `provideCodingAgentChat()` |
| `@coding-agent/chat/core` | wire contract + projection + pure helpers (zero Angular) |

The `core` entry point keeps the `ConversationEvent` wire contract importable with
zero Angular weight, so backends, SSR and tests can consume the types without the
renderer.

## License

[Apache-2.0](../../LICENSE)
