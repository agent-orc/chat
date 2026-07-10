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
| `coding-agent-chat/markdown` | `<cac-markdown>` + markdown utils + task-reference seam + inline-reference renderers |
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

<<<<<<< HEAD
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
=======
## Inline reference renderers

The conversation view exposes a **host-agnostic extension point** for turning
plain tokens inside message text — task keys (`AGT-1234`), ticket ids, URLs,
`@mentions` — into **live host components** (micro-cards, chips, links). The
library owns only the mechanics: it scans the rendered prose, matches each
registered pattern, and slots your component in place of the match. It never
learns what a reference *means* — that stays with the host.

Register one or more matchers via the `INLINE_REFERENCE_RENDERERS` token (or the
`inlineReferences` option of `provideCodingAgentChat`). Each matcher is:

```ts
interface InlineReferenceMatcher {
  id: string;                    // stable id; also the precedence tiebreaker
  pattern: RegExp;               // whole-match becomes the slot (cloned; safe to share)
  component: Type<unknown>;      // standalone host component slotted per match
  inputs?: (match) => Record<string, unknown>; // defaults to { token, match }
}
```

```ts
import { INLINE_REFERENCE_RENDERERS } from 'coding-agent-chat/markdown';

bootstrapApplication(AppComponent, {
  providers: [
    provideCodingAgentChat({
      inlineReferences: [
        { id: 'task', pattern: /\b[A-Z]{2,}-\d+\b/g, component: TaskMicroCardComponent },
        { id: 'url',  pattern: /https?:\/\/\S+/g,    component: UrlChipComponent },
      ],
    }),
    // …or provide the token directly:
    // { provide: INLINE_REFERENCE_RENDERERS, useValue: [ …matchers… ] },
  ],
});
```

The slotted component receives the match through inputs. By default it is fed
`token` (the matched string) and `match` (`{ matcherId, token, groups }`, where
`groups` are the pattern's named capture groups); declare whichever inputs you
need — a component with just a `token` input works with zero wiring:

```ts
@Component({
  selector: 'task-micro-card',
  standalone: true,
  template: `<a class="ref-card" (click)="open(token())">{{ token() }}</a>`,
})
export class TaskMicroCardComponent {
  readonly token = input<string>('');
  readonly match = input<InlineReferenceMatch | null>(null);
  // …fetch + render the live card for token()
}
```

Contract guarantees:

- **Markdown-safe.** Matches inside fenced code blocks, inline code and links
  are left as plain text — only prose is rewritten.
- **Zero cost by default.** With no matchers registered, message text renders
  exactly as before; the extension point is fully inert for other hosts.
- **Precedence.** Matchers are tried in registration order. The earliest match
  in reading order wins; when two matchers claim the same span, the one listed
  first wins.
- **Multiple matchers.** Register as many as you like — task keys *and* ticket
  ids *and* URLs — each mapped to its own component.

This composes with the task-reference auto-linker (`CHAT_TASK_REFERENCE_PROVIDER`),
which remains a separate, anchor-based seam; inline renderers skip existing
links, so the two never fight over the same token.
>>>>>>> 2df3520 (chore(wip): preserve uncommitted task work before teardown)

## Theme

An optional drop-in stylesheet with the studio look ships with the package:

```scss
@import 'coding-agent-chat/theme/cac-theme.css';
```

Dark by default; light theme via `data-studio-theme="light"` on a parent.

## License

[Apache-2.0](../../LICENSE)
