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
| `@coding-agent/chat/markdown` | `<cac-markdown>` + markdown utils + task-reference seam |
| `@coding-agent/chat/conversation` | `<cac-conversation-view>` + tool-burst chip + session card |
| `@coding-agent/chat/composer` | `<cac-chat>` composer + role badge + workforce/phase helpers |
| `@coding-agent/chat/shared` | `cacTooltip`, `cacStickToBottom`, lightbox directive + tokens |

The `core` entry point keeps the `ConversationEvent` wire contract importable with
zero Angular weight, so backends, SSR and tests can consume the types without the
renderer.

## Host wiring

Optional seams (task-reference auto-linking, image lightbox) default to safe
no-ops. Light them up from your bootstrap providers:

```ts
provideCodingAgentChat({
  taskReferences: TaskReferenceNavigationService, // implements ChatTaskReferenceProvider
  mediaLightbox: MediaLightboxService,            // implements ChatMediaLightbox
})
```

## Theme

An optional drop-in stylesheet with the studio look ships with the package:

```scss
@import '@coding-agent/chat/theme/cac-theme.css';
```

Dark by default; light theme via `data-studio-theme="light"` on a parent.

## License

[Apache-2.0](../../LICENSE)
