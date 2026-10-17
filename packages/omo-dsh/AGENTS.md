# omo-dsh - DeepSeek Harness adapter

Host bundle that ports OmO's capabilities to DeepSeek Harness (DSH). It ships OmO's keyword modes:
`ultrawork`, `team mode`, `hyperplan` (with the `hpp` shorthand), and the combined
`hyperplan + ultrawork` invocation, plus the first batch of OmO's harness-neutral skill library
(`git-master`, `debugging`, `remove-ai-slops`). The package is private and is not published to npm;
users install the bundle into a DSH profile. The phased plan for the remaining capabilities lives in
[`ROADMAP.md`](./ROADMAP.md).

## Why a bundle and not a port of an existing adapter

DSH is a Cordis host with its own plugin surface. OMO's OpenCode plugin API, Codex plugin API, and
Senpi Pi extension API do not exist there, so the adapter uses two documented DSH seams:

- `agent/pre-step` (waterfall): payload `{ agent, messages, turn, step, signal }`, decision
  `{ kind: "reject" } | { kind: "enter", messages, startsRequestSeries? }`. Appending a synthetic
  sourced `user/message` here is the same mechanism first-party plugins use for time context,
  repeat-tool reminders, and workspace instructions.
- `ctx.skills.register(...)`: publishes each directive as a namespaced runtime skill (`omo-ultrawork`,
  `omo-hyperplan`), so the model can load a body with the `skill` tool.

The injected message is durable session history, so replay, fork, and resume see exactly what the
model saw. No durable plugin-private state is needed: a bounded in-memory arming ledger only
prevents a retried step from appending the pointer twice.

## Layout

| Path | Role |
|------|------|
| `index.js` | Host plugin `omo-ultrawork`: skill registration plus the prepended `agent/pre-step` injection |
| `lib/modes.js` | Mode registry in priority order (combo, hyperplan, team, ultrawork), per-mode patterns, negation keywords, and pointers |
| `lib/detect.js` | Shared scrub pipeline (code spans, URLs, negated mentions, boundary guards), message text, child-session guard |
| `lib/pointer.js` | Per-mode bootstrap pointers and the synthetic message factory |
| `lib/skill.js` | Loads a shipped markdown body into a runtime skill definition |
| `lib/library.js` | Registry of the ported OmO skill library and its loader |
| `skills/ultrawork.md` | Ultrawork directive, adapted to the DeepSeek Harness tool surface |
| `skills/hyperplan.md` | Hyperplan directive, adapted from the OmO adversarial planning skill to DSH Agent Teams |
| `skills/git-master.md` | Git workflow directive, adapted from OmO's `git-master` skill |
| `skills/debugging.md` | Hypothesis-driven debugging directive, adapted from OmO's `debugging` skill |
| `skills/remove-ai-slops.md` | AI-slop cleanup directive, adapted from OmO's `remove-ai-slops` skill |
| `cordis.patch.yml` | Inserts the `omo-ultrawork` Host row |
| `locale/`, `icon.svg` | Plugin Manager display metadata |
| `test/` | Behavior tests, run with `bun test packages/omo-dsh` |

## Mode routing

One mode injects per step, highest priority first: `hyperplan-ultrawork` (strict adjacency, both word
orders) suppresses `hyperplan` and `ultrawork`; then `hyperplan` (`hyperplan`, or `hpp` that is not a
file extension or identifier suffix, `interface.hpp` stays inert); then `team mode`
(`team mode`, `team-mode`, `team_mode`, `teammode`); then `ultrawork` (configured keywords). Each mode
has its own source kind (`omo-ultrawork`, `omo-team`, `omo-hyperplan`,
`omo-hyperplan-ultrawork`) so the session log and dedupe stay mode-specific. `search` and `analyze`
were removed from OmO and are not ported.

## Skill library

Batch 1 ports the harness-neutral OmO workflows that need no OpenCode-only tool. Each one is adapted
to the DSH tool surface (`bash`, `read`, `write`, `edit`, `grep`, `glob`, `subagent`, `workflow`,
`todo_write`, background jobs, `terminal_*`) instead of OmO's OpenCode tools (`task`, `lsp_*`,
`background_output`). Registered names stay namespaced: `omo-git-master`, `omo-debugging`,
`omo-remove-ai-slops`.

The library registers through the same `ctx.skills.register` seam as the mode skills; disable the
whole batch with `skills: { library: false }`. Batch 2 (skills that depend on absent tools, for
example LSP, ast-grep, browser automation) waits for the corresponding tool mapping in Phase 4.

## Runtime constraints

- The bundle imports no `@deepseek-ai/*` package. A profile-linked bundle cannot resolve the
  Harness installation's packages, so the guest side builds the message shape itself. Verified
  against the live Harness: the shape is `{ id, role: "user", content: [{ type: "text", text }],
  source: { kind, form, summary } }` with a non-empty string id.
- The runtime is plain ESM JavaScript by design: the DSH bundle contract needs no build tool or
  dependency, and the tests exercise the same files the Host loads.
- The plugin declares `inject = ["skills"]`; profiles without the skill registry leave it inactive
  instead of throwing.
- The runtime skills are namespaced (`omo-ultrawork`, `omo-hyperplan`), never bare `ultrawork` or
  `hyperplan`: user and project skill layers outrank runtime registrations, and those bare names
  commonly exist in a user's own skill set. A shared name would make the injected pointer load that
  other directive, so each pointer names its skill explicitly.
- Config keys: `enabled` (default `true`), `keywords` (ultrawork keywords, default
  `["ultrawork", "ulw"]`), `applyToSubagents` (default `false`), `modes`
  (`{ ultrawork, team, hyperplan, hyperplanUltrawork }`, all default `true`; disabling `hyperplan`
  also disables the combo), and `skills` (`{ library }`, default `true`). Unknown keys fail
  activation so a typo cannot silently disable a mode or a skill.

## Detection contract

Case-insensitive, whole word, `ulw` followed by `-` and a word character is a skill name and never
triggers. Before matching, the prompt is scrubbed in this order: code fences and inline code are
removed, URLs are removed, negated mentions are blanked out (English `do not use` / `don't` /
`never` / `without` / `avoid` / `disable` / `stop` and the Chinese equivalents), then the keyword
must sit on a word boundary that is not a URL, path, or identifier continuation (`docs/ulw/…`,
`my-ulw-feature`, `ulw_shard` stay inert). Only human-authored messages (`role: "user"`,
`source.kind: "user"`) arm the mode, and a delegated child session never arms it unless
`applyToSubagents` is set.

Arming is remembered per live session and keyed by the mode and the claimed message id: a step
retried after a pre-commit failure cannot append a second pointer for the same human message. The
ledger is in memory only, bounded per session, and disappears with the session; replay and resume
rebuild model state from the durable log, which still holds the original injection.

## Install and QA

```bash
# from a checkout, into the profile that should use it
dsh plugin --profile <profile> add "$(pwd)/packages/omo-dsh"
```

Inside a running Harness the Plugin Manager installs the same directory. Verify activation through
the Plugin Manager row and a live session: a prompt containing `ulw` must produce an assistant reply
that opens with `ULTRAWORK MODE ENABLED!`, a `user/message` event whose source kind is
`omo-ultrawork` in the session log, and a `skill` tool call with `name: "omo-ultrawork"`. The other
modes follow the same shape with their own banner, source kind, and skill name (`hyperplan` also
ships `hpp` and the combined invocation).

QA evidence for changes here follows the repository rules: write artifacts under
`.omo/evidence/<YYYYMMDD>-<short-slug>/`, keep them out of git, and summarize them in the PR body.

Parent: [packages/AGENTS.md](../AGENTS.md)
