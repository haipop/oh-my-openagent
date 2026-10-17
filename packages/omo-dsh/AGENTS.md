# omo-dsh - DeepSeek Harness adapter

Host bundle that ports OmO's ultrawork mode (`ulw` / `ultrawork`) to DeepSeek Harness (DSH).
Version one ships one capability: the ultrawork keyword mode. The package is private and is not
published to npm; users install the bundle into a DSH profile.

## Why a bundle and not a port of an existing adapter

DSH is a Cordis host with its own plugin surface. OMO's OpenCode plugin API, Codex plugin API, and
Senpi Pi extension API do not exist there, so the adapter uses two documented DSH seams:

- `agent/pre-step` (waterfall): payload `{ agent, messages, turn, step, signal }`, decision
  `{ kind: "reject" } | { kind: "enter", messages, startsRequestSeries? }`. Appending a synthetic
  sourced `user/message` here is the same mechanism first-party plugins use for time context,
  repeat-tool reminders, and workspace instructions.
- `ctx.skills.register(...)`: publishes the runtime `ultrawork` skill so the model can load the
  full directive with the `skill` tool.

The injected message is durable session history, so replay, fork, and resume see exactly what the
model saw. No plugin-private state is needed.

## Layout

| Path | Role |
|------|------|
| `index.js` | Host plugin `omo-ultrawork`: skill registration plus the prepended `agent/pre-step` injection |
| `lib/detect.js` | Keyword detection (code spans stripped, `ulw-*` excluded), message text, child-session guard |
| `lib/pointer.js` | Compact three-step bootstrap pointer and the synthetic message factory |
| `lib/skill.js` | Loads `skills/ultrawork.md` into the runtime skill definition |
| `skills/ultrawork.md` | Full directive, adapted to the DeepSeek Harness tool surface |
| `cordis.patch.yml` | Inserts the `omo-ultrawork` Host row |
| `locale/`, `icon.svg` | Plugin Manager display metadata |
| `test/` | Behavior tests, run with `bun test packages/omo-dsh` |

## Runtime constraints

- The bundle imports no `@deepseek-ai/*` package. A profile-linked bundle cannot resolve the
  Harness installation's packages, so the guest side builds the message shape itself. Verified
  against the live Harness: the shape is `{ id, role: "user", content: [{ type: "text", text }],
  source: { kind, form, summary } }` with a non-empty string id.
- The runtime is plain ESM JavaScript by design: the DSH bundle contract needs no build tool or
  dependency, and the tests exercise the same files the Host loads.
- The plugin declares `inject = ["skills"]`; profiles without the skill registry leave it inactive
  instead of throwing.
- Config keys: `enabled` (default `true`), `keywords` (default `["ultrawork", "ulw"]`),
  `applyToSubagents` (default `false`). Unknown keys fail activation so a typo cannot silently
  disable the mode.

## Detection contract

Same semantics as the OpenCode detector: case-insensitive, whole word, `ulw` followed by `-` and a
word character is a skill name and never triggers. Code fences and inline code are stripped before
matching. Only human-authored messages (`role: "user"`, `source.kind: "user"`) arm the mode, and a
delegated child session never arms it unless `applyToSubagents` is set.

## Install and QA

```bash
# from a checkout, into the profile that should use it
dsh plugin --profile <profile> add "$(pwd)/packages/omo-dsh"
```

Inside a running Harness the Plugin Manager installs the same directory. Verify activation through
the Plugin Manager row and a live session: a prompt containing `ulw` must produce an assistant reply
that opens with `ULTRAWORK MODE ENABLED!`, a `user/message` event whose source kind is
`omo-ultrawork` in the session log, and a `skill` tool call with `name: "ultrawork"`.

QA evidence for changes here follows the repository rules: write artifacts under
`.omo/evidence/<YYYYMMDD>-<short-slug>/`, keep them out of git, and summarize them in the PR body.

Parent: [packages/AGENTS.md](../AGENTS.md)
