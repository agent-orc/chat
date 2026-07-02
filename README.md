# coding-agent-chat

A standalone, best-in-class **Angular library** that renders the chat UI of a
coding agent — plus a demo/playground ("Conversation Lab"). The frontend
counterpart to [`coding-agent-runner`](https://github.com/RobertMischke/coding-agent-runner):
the runner produces the server-side event stream, this library renders it.

This is an Angular CLI workspace (Angular 21.2, `ng-packagr`):

| Project | Path | Purpose |
|---|---|---|
| `@coding-agent/chat` | [`projects/coding-agent-chat`](projects/coding-agent-chat) | the publishable library |
| `conversation-lab` | [`projects/conversation-lab`](projects/conversation-lab) | demo / playground app |

## Build

```sh
npm install
npm run build        # ng build coding-agent-chat → dist/coding-agent-chat
```

## Conversation Lab (demo / playground)

A small zoneless application that exercises the library end-to-end:
`<cac-conversation-view>` over hand-built `ConversationEvent` fixtures
(message groups, tool burst, run markers, orchestrator decision, image
artifacts), a `<cac-chat>` composer whose submits append local user turns,
and `<cac-project-chat-list>` backed by an in-memory
`PROJECT_CHAT_DATA_SOURCE` implementation. The studio theme ships from the
package CSS (`theme/cac-theme.css`, dark by default) with a dark/light
toggle flipping `data-studio-theme`.

```sh
npm run build                    # build the library first — the demo consumes dist/
npm run lab                      # ng serve conversation-lab → http://localhost:4200
npx ng build conversation-lab    # production build → dist/conversation-lab
```

## Develop against the library (watch)

```sh
ng build coding-agent-chat --watch
```

Consumers should depend on the **built `dist/`** output (not the source) — this
exercises the published partial-Ivy compile mode and catches strict-template
mismatches early. The Conversation Lab demo follows the same rule: its
tsconfig paths resolve `@coding-agent/chat/*` to `dist/`, so rebuild the
library before serving the demo.

## License

[Apache-2.0](LICENSE)
