# coding-agent-chat

A standalone, best-in-class **Angular library** that renders the chat UI of a
coding agent — plus a demo/playground ("Conversation Lab"). The frontend
counterpart to [`coding-agent-runner`](https://github.com/RobertMischke/coding-agent-runner):
the runner produces the server-side event stream, this library renders it.

This is an Angular CLI workspace (Angular 21.2, `ng-packagr`):

| Project | Path | Purpose |
|---|---|---|
| `@coding-agent/chat` | [`projects/coding-agent-chat`](projects/coding-agent-chat) | the publishable library |
| `conversation-lab` | [`projects/conversation-lab`](projects/conversation-lab) | demo / playground app (dev server port 4201) |
| `website` | [`projects/website`](projects/website) | public website (GitHub Pages) with live component demos (dev server port 4202) |

Each app has a fixed dev-server port in `angular.json`, so both can run side
by side (`npm run lab` → 4201, `npm run website` → 4202).

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
npm run lab                      # ng serve conversation-lab → http://localhost:4201
npx ng build conversation-lab    # production build → dist/conversation-lab
```

## Website (GitHub Pages)

The public site for the library — hero, an animated live replay of a
conversation rendered by `<cac-conversation-view>` + `<cac-chat>`, a
`<cac-project-chat-list>` history demo over an in-memory
`PROJECT_CHAT_DATA_SOURCE`, feature grid and docs. Like the lab it consumes
the built `dist/` output and the packaged studio theme.

```sh
npm run build                    # build the library first — the site consumes dist/
npm run website                  # ng serve website → http://localhost:4202
npx ng build website             # production build → dist/website
```

Deployed automatically by [`.github/workflows/pages.yml`](.github/workflows/pages.yml)
on every push to `main` (base href `/coding-agent-chat/`, SPA `404.html` fallback).

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
