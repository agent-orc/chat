# coding-agent-chat

A standalone, best-in-class **Angular library** that renders the chat UI of a
coding agent — plus a demo/playground ("Conversation Lab"). The frontend
counterpart to [`coding-agent-runner`](https://github.com/RobertMischke/coding-agent-runner):
the runner produces the server-side event stream, this library renders it.

This is an Angular CLI workspace (Angular 21.2, `ng-packagr`):

| Project | Path | Purpose |
|---|---|---|
| `@coding-agent/chat` | [`projects/coding-agent-chat`](projects/coding-agent-chat) | the publishable library |

## Build

```sh
npm install
npm run build        # ng build coding-agent-chat → dist/coding-agent-chat
```

## Develop against the library (watch)

```sh
ng build coding-agent-chat --watch
```

Consumers should depend on the **built `dist/`** output (not the source) — this
exercises the published partial-Ivy compile mode and catches strict-template
mismatches early.

## License

[Apache-2.0](LICENSE)
