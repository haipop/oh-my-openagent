# omo-dsh - DeepSeek Harness adapter

Host bundle that ports OmO's capabilities to DeepSeek Harness (DSH). It ships OmO's keyword modes:
`ultrawork`, `team mode`, `hyperplan` (with the `hpp` shorthand), and the combined
`hyperplan + ultrawork` invocation, four batches of OmO's harness-neutral skill library
(`git-master`, `debugging`, `remove-ai-slops`, `data-scientist`, `review-work`, `init-deep`,
`ulw-plan`, `ulw-execute`, `ulw-research`, `programming`, `refactor`, `frontend`, `ast-grep`,
`lsp-setup`, `coding-agent-sessions`), and nine OMO agent-role presets (Prometheus, Oracle, Librarian, Explore, Metis, Momus, Multimodal-Looker,
Sisyphus, Atlas), plus two hook-level checks: `.omo/rules` injection and a write/edit comment check.
The package is private and is not published to npm; users install the bundle into a DSH profile. The phased plan for the remaining
capabilities lives in [`ROADMAP.md`](./ROADMAP.md).

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
| `lib/config-file.js` | Reads the shared OmO config (`~/.omo/omo.json[c]` and nearest project `.omo/omo.json[c]`), JSONC-tolerant, and merges its `dsh` block under the row config |
| `lib/rules.js` | Reads `.omo/rules/*.md`, parses the frontmatter subset (`description`, `globs`, `alwaysApply`), selects matching rules, and renders the injected rules context |
| `lib/comment-checker.js` | Detects comments that only restate the code in `write`/`edit` payloads and renders the bounded warning context |
| `skills/ultrawork.md` | Ultrawork directive, adapted to the DeepSeek Harness tool surface |
| `skills/hyperplan.md` | Hyperplan directive, adapted from the OmO adversarial planning skill to DSH Agent Teams |
| `skills/git-master.md` | Git workflow directive, adapted from OmO's `git-master` skill |
| `skills/debugging.md` | Hypothesis-driven debugging directive, adapted from OmO's `debugging` skill |
| `skills/remove-ai-slops.md` | AI-slop cleanup directive, adapted from OmO's `remove-ai-slops` skill |
| `skills/data-scientist.md` | Hybrid-engine data analysis directive, adapted from OmO's `data-scientist` skill |
| `skills/review-work.md` | Post-implementation gate review directive, adapted from OmO's `review-work` skill |
| `skills/init-deep.md` | Hierarchical AGENTS.md generation directive, adapted from OmO's `init-deep` skill |
| `skills/ulw-plan.md` | Decision-complete planning directive, adapted from OmO's `ulw-plan` skill |
| `skills/ulw-execute.md` | Orchestrator-only plan execution directive, adapted from OmO's `ulw-execute` skill |
| `skills/ulw-research.md` | Claim-graph research directive, adapted from OmO's `ulw-research` skill |
| `skills/programming.md` | Language-gated programming practice directive, adapted from OmO's `programming` skill |
| `skills/refactor.md` | Behavior-locked refactor directive, adapted from OmO's `refactor` skill |
| `skills/frontend.md` | Design-quality frontend directive, adapted from OmO's `frontend` skill |
| `skills/ast-grep.md` | Structural search and codemod directive over the `sg` CLI, adapted from OmO's `ast-grep` skill |
| `skills/lsp-setup.md` | LSP wiring directive: build `lsp-tools-mcp`, verify its stdio handshake, register the MCP row, confirm the tools |
| `skills/coding-agent-sessions.md` | Local agent-transcript reading directive, adapted from OmO's `coding-agent-sessions` skill |
| `cordis.patch.yml` | Inserts the `omo-ultrawork` Host row and the nine OMO agent-preset declarations |
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

Four batches port the OmO skills that work on the DSH tool surface. Each one is adapted to `bash`,
`read`, `write`, `edit`, `grep`, `glob`, `subagent`, `workflow`, `todo_write`, background jobs, and
`terminal_*` instead of OmO's OpenCode tools (`task`, `lsp_*`, `background_output`). Registered names
stay namespaced: `omo-git-master`, `omo-debugging`, `omo-remove-ai-slops`, `omo-data-scientist`,
`omo-review-work`, `omo-init-deep`, `omo-ulw-plan`, `omo-ulw-execute`, `omo-ulw-research`,
`omo-programming`, `omo-refactor`, `omo-frontend`, `omo-ast-grep`, `omo-lsp-setup`,
`omo-coding-agent-sessions`.

- Batch 1: `git-master`, `debugging`, `remove-ai-slops`.
- Batch 2: `data-scientist`, `review-work`, `init-deep`.
- Batch 3: `ulw-plan`, `ulw-execute`, `ulw-research`, `programming`, `refactor`, `frontend`. These
  are the OMO workflow skills that the agent roles unblocked; each body is a condensed,
  self-contained directive, while the original skill's reference packs and helper scripts stay in
  the repository instead of being copied into the bundle.

- Batch 4: `ast-grep` (structural search and codemods through the `sg` CLI, with a presence gate),
  `lsp-setup` (build `packages/lsp-tools-mcp`, verify its stdio `tools/list` handshake, register a
  `@deepseek-ai/dsh-mcp-client` row on the profile, confirm the `mcp__lsp__*` tools), and
  `coding-agent-sessions` (find and read local agent transcripts without mutating their stores).
- Not ported: `browser`, `ultimate-browsing`, and `visual-qa` are bound to OmO's own browser engine and
  screenshot pipeline. DSH exposes browser automation through user-installed MCP servers or CLIs, so a
  ported body would either duplicate an installed tool or promise a capability the profile may not
  have. They stay in the repository instead.

The library registers through the same `ctx.skills.register` seam as the mode skills; disable the
whole library with `skills: { library: false }`.

LSP capability is deliberately not a bundle row: the MCP server path is machine-specific, so shipping
an absolute path in `cordis.patch.yml` would break on any other checkout. `omo-lsp-setup` carries the
tested recipe (build, handshake check, profile row, verification) and the user owns when to run it.

## Agent presets

The bundle patch also carries nine `@deepseek-ai/dsh-agent-preset` declarations, so installing the
bundle puts OMO's roles on the Harness roster next to the shipped presets. Two groups: read-only
specialists and full-tool orchestrators.

| Preset id | Roster name | Role | Tool surface |
|---|---|---|---|
| `omo-prometheus` | Prometheus (OMO planner) | Turns a request into one decision-complete plan | read-only: fs read/image, search, bash inspection, web, skill, ask-user, jobs |
| `omo-oracle` | Oracle (OMO advisor) | Read-only architecture, security, performance, and hard-debugging advice | read-only, same surface as Prometheus |
| `omo-librarian` | Librarian (OMO research) | Upstream docs, changelogs, and standards with cited evidence | read-only plus web |
| `omo-explore` | Explore (OMO search) | Codebase search: paths, line numbers, quoted matches | fs read, search, bash inspection, skill, jobs |
| `omo-metis` | Metis (OMO plan critic) | Pre-planning interrogation: ambiguity, constraints, hidden assumptions | read-only plus ask-user |
| `omo-momus` | Momus (OMO plan reviewer) | Attacks a plan for gaps, feasibility, verification, over-engineering | read-only plus ask-user |
| `omo-multimodal-looker` | Multimodal-Looker (OMO vision) | Precise visual analysis of screenshots, diagrams, charts, images | `read` and `read_image` only |
| `omo-sisyphus` | Sisyphus (OMO orchestrator) | Main orchestrator: plan, delegate, verify on the real surface, report evidence | full matrix: bash, fs read/write/edit, search, jobs, schedule, web, skill, goal, plan mode, todo, delegation, ask-user, present |
| `omo-atlas` | Atlas (OMO todo orchestrator) | Turns a plan into an explicit todo list, works it, verifies each item | full matrix, same as Sisyphus |

Each declaration composes a `@deepseek-ai/dsh-persona` prefix (`complete: true`), the
`@deepseek-ai/dsh-agent-instructions` row with `maxBytes: 131072` so a large repository AGENTS.md is
not truncated, the role's tool rows, and the compaction group. The presets are not selected by
default: a session picks one from the Desktop roster, or the profile overrides the
`agent-preset-registry` row.

A child plugin with required config must get it. The `@deepseek-ai/dsh-plan-mode` row requires a
`section`; omitting it leaves the declaration loaded and active at the Loader level, but the preset is
absent from the roster with no visible error. Verify every preset appears in the Desktop roster, not
only that the Loader rows report `active`.

The `headless` profile mounts `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-headless`, not the Web
app bundle, so it has no `agent-preset-registry` service and ignores the declarations; live preset QA
therefore runs through the Desktop roster. The declarations still load and activate in profiles that
mount the registry: a broken declaration stays on the roster with its diagnostic and cannot compose a
session until the bundle is fixed.

## Runtime constraints

- The bundle imports no `@deepseek-ai/*` package. A profile-linked bundle cannot resolve the
  Harness installation's packages, so the guest side builds the message shape itself. Verified
  against the live Harness: the shape is `{ id, role: "user", content: [{ type: "text", text }],
  source: { kind, form, summary } }` with a non-empty string id.
- The runtime is plain ESM JavaScript by design: the DSH bundle contract needs no build tool or
  dependency, and the tests exercise the same files the Host loads.
- The plugin declares `inject = ["skills", "workingDirectory"]`; profiles without those services
  leave it inactive instead of throwing. The working-directory dependency is not cosmetic: reading a
  Cordis service outside `inject` yields `undefined` in the mounted plugin context, so an optional
  access silently skipped rule loading until the dependency was declared.
- The runtime skills are namespaced (`omo-ultrawork`, `omo-hyperplan`), never bare `ultrawork` or
  `hyperplan`: user and project skill layers outrank runtime registrations, and those bare names
  commonly exist in a user's own skill set. A shared name would make the injected pointer load that
  other directive, so each pointer names its skill explicitly.
- Config keys: `enabled` (default `true`), `keywords` (ultrawork keywords, default
  `["ultrawork", "ulw"]`), `applyToSubagents` (default `false`), `modes`
  (`{ ultrawork, team, hyperplan, hyperplanUltrawork }`, all default `true`; disabling `hyperplan`
  also disables the combo), `skills` (`{ library }`, default `true`), `rules`
  (`{ enabled, roots, maxRules, maxBytes }`, default on with `.omo/rules` and `~/.omo/rules`), and
  `commentChecker` (`{ enabled, tools, maxWarnings }`, default on for `write` and `edit`). Unknown
  keys fail activation so a typo cannot silently disable a mode, a skill, or a check.

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

## Shared config file

The adapter reads the repository-wide OmO config for runtime defaults: `~/.omo/omo.json[c]` for
the user layer and the nearest `<project>/.omo/omo.json[c]` up the tree for project layers. Only the
`dsh` block is read, because the same file configures other harnesses and a same-named top-level key
must not silently change DSH behavior. JSONC is accepted (comments and trailing commas).

Precedence: the plugin row config wins over every file; the nearest project layer wins over outer
project layers; the user layer is the lowest level. Keys: `enabled`, `keywords`, `applyToSubagents`,
`modes`, `skills`, `rules`, `commentChecker`. An invalid file falls back to the row config with a
warning instead of breaking the session.

What the file cannot change is which runtime skills are registered: skills publish once at bundle
activation, so `skills` in the file is part of the config surface but skill registration follows the
row.

## Rules and comment checks

OmO's `rules-injector` and `comment-checker` hooks do not exist as plugin seams in DeepSeek Harness,
so this bundle uses the two waterfalls the Host does expose.

**Rules.** `agent/pre-step` reads `.omo/rules/*.md` under the session directory (then
`~/.omo/rules`), parses the frontmatter subset OmO rule files use, and appends one sourced
`user/message` (kind `omo-rules`) per session listing the rules that apply. A rule with no `globs`,
or with `alwaysApply: true`, applies to the whole session; a glob-scoped rule joins only when the
prompt names a matching path. Rules use the declared `workingDirectory` dependency to resolve the session
directory; a profile without that service leaves the whole bundle inactive. Per-rule injection is
remembered per live session so a later prompt cannot duplicate a rule.

**Comment check.** `tools/post-execute` inspects the text a `write` or `edit` call added, flags
comments that only restate the code (obvious narration, filler wording, banners, commented-out code,
em dashes), and attaches a bounded warning context (kind `omo-comments`) to the accepted result. The
tool has already run, so the decision stays `accept`; the model sees the warning on its next step.
Warnings are capped per session. The check is deliberately conservative: a noisy checker trains the
model to ignore it.

Both checks are config-gated (`rules`, `commentChecker`) and both fail open: a read error or an
unexpected payload skips the injection and logs a warning instead of breaking the step.

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

Team mode and parallel execution can be exercised in the headless profile without touching the
Desktop profile: mount the Agent Teams rows through a `--patch` overlay (the same rows the Desktop
profile bundle carries), then run a task that creates tasks, spawns two members, waits, and closes
the board. A parallel `workflow` run needs no overlay: the headless profile already mounts
`workflow-ptc` and `tool-workflow`.

```yaml
# /tmp/team.patch.yml, applied with: dsh --profile headless --patch /tmp/team.patch.yml ...
- insert:
    - id: agent-team
      name: '@deepseek-ai/dsh-experimental-agent-team'
      config: { maxMembers: 3, maxTasks: 16, maxMessageBytes: 65536, disposalTimeoutMs: 5000 }
    - id: tool-agent-team
      name: '@deepseek-ai/dsh-experimental-tool-agent-team'
      config: { freshProvider: spawn, forkProvider: fork }
```

QA evidence for changes here follows the repository rules: write artifacts under
`.omo/evidence/<YYYYMMDD>-<short-slug>/`, keep them out of git, and summarize them in the PR body.

Parent: [packages/AGENTS.md](../AGENTS.md)
