# coding-agent-chat

Best-in-class Angular library for rendering **coding-agent conversations** — the
frontend counterpart to [`coding-agent-runner`](https://github.com/RobertMischke/coding-agent-runner).
The runner produces the server-side event stream; `coding-agent-chat` renders it
client-side: from raw evidence (CLI output lines, run timeline, tokens, screenshots,
commits) to a fully grouped, progressively-disclosed conversation.

> Status: **early bootstrap.** The public surface is being carved out of the
> agent-taskboard frontend per the extraction plan. APIs are not yet stable.

## Install

```sh
npm install coding-agent-chat
```

Peer dependencies: `@angular/core`, `@angular/common`, `@angular/forms` (`>=21 <22`)
and `rxjs ~7.8`.

## Entry points

| Import | Contents |
|---|---|
| `coding-agent-chat` | everything + `provideCodingAgentChat()` |
| `coding-agent-chat/core` | wire contract + projection + pure helpers (zero Angular) |
| `coding-agent-chat/markdown` | `<cac-markdown>` + markdown utils + task-reference seam |
| `coding-agent-chat/conversation` | `<cac-conversation-view>` + tool-burst chip + session card |
| `coding-agent-chat/composer` | `<cac-chat>` composer + role badge + workforce/phase helpers |
| `coding-agent-chat/history` | `<cac-project-chat-list>` virtualised history + `<cac-chat-row>` + minimap rail + phase summary strip |
| `coding-agent-chat/shared` | `cacTooltip`, `cacStickToBottom`, lightbox directive + tokens |

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

The `history` entry point adds two more optional seams, provided directly:
`PROJECT_CHAT_DATA_SOURCE` (the scroll/search/stats/turn transport behind
`<cac-project-chat-list>` — defaults to an empty history) and
`CHAT_HISTORY_CONFIRM` (guard prompt before loading an entire deep history —
defaults to auto-confirm).

## Model selector: the catalog contract

The composer's model selector (`<cac-model-selector>`, surfaced automatically by
`<cac-chat>` when the host provides a `ChatModelControl`) is **host-agnostic by
design**: it hardcodes no model ids and no reasoning-level lists. Everything it
shows comes from the catalog the host feeds in. Surfacing a brand-new model — say
`gpt-5.6` with an extra-high reasoning level — needs **zero library changes**;
the host just adds an entry to the catalog it already supplies.

A catalog is a list of `ChatModelOption` (from `coding-agent-chat/core`):

```ts
interface ChatModelOption {
  id: string;                          // the model id you pass back to your CLI
  label?: string;                      // display label; falls back to `id`
  isDefault?: boolean;                 // the CLI's default when no model is set
  available?: boolean;                 // `false` hides it from the picker
  thinkingLevels?: readonly string[];  // reasoning levels — empty ⇒ no level row
  defaultThinkingLevel?: string | null;// preselected level when this model is picked
}
```

To surface `gpt-5.6` with an extra-high level as the Codex default, the host
answers `modelCatalogRequested('codex')` with:

```ts
const control: ChatModelControl = {
  cliOptions: [{ id: 'codex', label: 'Codex', icon: '◆' }],
  cliType: 'codex',
  catalog: [
    {
      id: 'gpt-5.6',
      label: 'GPT-5.6',
      isDefault: true,
      thinkingLevels: ['low', 'medium', 'high', 'xhigh'],
      defaultThinkingLevel: 'xhigh',
    },
    // ...other Codex models
  ],
};
```

Behaviour that follows from the catalog alone:

- **Level pills** (including `xhigh` / "extra high") render from
  `thinkingLevels`. There is no per-model allow-list in the library — add a
  level to the array and it appears; drop it and it disappears.
- **No ghost entries.** A model shows up only while the catalog lists it. Remove
  `gpt-5.6` from the catalog and its pill is gone on the next
  `modelCatalogRequested` answer.
- **Readable fallback labels.** The trigger chip compacts known `claude-*` ids
  (`claude-sonnet-5` → "sonnet 5") and strips a `vendor/` prefix; any other id
  (e.g. `gpt-5.6`) passes through **unchanged** — a readable fallback, never a
  blank or crashing chip. In the picker each pill uses `label`, falling back to
  the raw `id` when a host hasn't supplied one yet.

The host owns discovery: it loads the catalog for the requested CLI in response
to `modelCatalogRequested` / `modelRefreshRequested`, and receives the user's
choice as an atomic `ChatModelSelection` (`{ cliType, model, thinkingLevel }`,
where `model === ''` means "CLI default") on `modelCommit`. See the
Conversation Lab (`projects/conversation-lab`) for a worked host example.

## Theme

An optional drop-in stylesheet with the studio look ships with the package:

```scss
@import 'coding-agent-chat/theme/cac-theme.css';
```

Dark by default; light theme via `data-studio-theme="light"` on a parent.

## License

[Apache-2.0](../../LICENSE)
