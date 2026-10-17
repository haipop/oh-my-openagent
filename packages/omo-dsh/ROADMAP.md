# omo-dsh capability roadmap

Goal: DeepSeek Harness gets OmO's full capability set, not only the ultrawork keyword mode. Every
phase ships as its own PR with unit tests, repository gates, a live DSH run through the real model,
and a Chinese audit note in the gitignored evidence directory.

## Design constraints (apply to every phase)

- One zero-dependency Host bundle; no `@deepseek-ai/*` imports (a profile-linked bundle cannot
  resolve them).
- Namespaced capability names (`omo-<capability>`) because user and project skills outrank runtime
  registrations.
- Config-gated: an unconfigured install keeps the current behavior.
- Tool references in shipped prose must exist in the target profile's tool surface; prose that
  mentions absent optional tools must say they may be absent.
- Anything already native in DSH is reused, not re-implemented.

## Status legend

`LANDED` shipped and QA'd, `NEXT` agreed as the next slice, `PLANNED` sequenced, `EVALUATE` needs a
design decision before implementation, `NATIVE` no port needed (DSH already provides it).

## Capability matrix

| Capability | OmO source | DSH mapping | Status |
|---|---|---|---|
| ultrawork mode + directive | `prompts-core/prompts/ultrawork/*`, OpenCode keyword detector | `agent/pre-step` injection + runtime `omo-ultrawork` skill | LANDED (PR #1, #2, #3) |
| keyword mode routing | OpenCode `keyword-detector` (ultrawork / team / hyperplan / hyperplan-ultrawork; search and analyze were removed upstream) | one mode registry on the same injection seam, per-mode pointers, namespaced runtime skills, per-mode config | LANDED (PR #5) |
| skill library | `shared-skills` (18 skills) + OpenCode builtin skills | `ctx.skills.register` per adapted skill, namespaced `omo-*`; batches 1-4 (`git-master`, `debugging`, `remove-ai-slops`, `data-scientist`, `review-work`, `init-deep`, `ulw-plan`, `ulw-execute`, `ulw-research`, `programming`, `refactor`, `frontend`, `ast-grep`, `lsp-setup`, `coding-agent-sessions`) landed; `browser`/`ultimate-browsing`/`visual-qa` documented as not portable | LANDED except the three browser-bound skills (PR #6, #7, #10, #12) |
| agent roles | 11 agents + category routing (`model-core`, `delegate-core`) | DSH agent presets (YAML composition); nine presets landed (four read-only specialists plus Sisyphus, Atlas, Metis, Momus, Multimodal-Looker); `hephaestus` and `sisyphus-junior` need category routing and are documented as not portable at the preset seam | LANDED at the DSH boundary (PR #8, #9) |
| rules injection | `rules-engine` + `rules-injector` hook | `.omo/rules/*.md` read once per session and injected as sourced context through `agent/pre-step`, with frontmatter globs matched against prompt paths | LANDED (Phase 4 batch 1, PR #11) |
| comment checker | `comment-checker-core` + binary | `tools/post-execute` scans added `write`/`edit` text for slop comments and attaches a bounded warning context; the bundled binary is not ported (no external-checker seam) | LANDED (Phase 4 batch 1, PR #11) |
| LSP tools | `lsp-tools-mcp` (8 tool aliases) | built `dist/cli.js` registered through `@deepseek-ai/dsh-mcp-client` on the profile (not a bundle row: the path is machine-specific); `omo-lsp-setup` carries the tested recipe | LANDED as an on-demand recipe (PR #12) |
| hashline edit | `hashline-core` + patched edit tool | DSH's `write`/`edit` already carry a file-version guard and the `fs/write-intent` + `fs/edit-intent` waterfalls, so a second hash protocol would fight the Host's own guard | NATIVE (no port) |
| team mode | OpenCode 12 `team_*` tools + mailbox/lockstep engine | DSH Agent Teams is native; keyword pointer lands in Phase 1, prompts/skills in Phase 5 | PARTIAL (Phase 1) |
| task delegation, background agents | `delegate-core`, background-agent feature | native `subagent`, `workflow`, `bash` jobs | NATIVE (guidance only) |
| todo + goal | OpenCode tools | native `todo_write`, `create_goal`/`update_goal`/`get_goal` | NATIVE |
| config | `omo-config-core` (`~/.omo/omo.json[c]`) | adapter reads the `dsh` block from the user layer and the nearest project layer (JSONC), merged under the row config | LANDED (Phase 6 batch 1, PR #13) |
| model routing / fallback | `model-core`, category requirements, two fallback systems | DSH model selection + retry policy; evaluate per-preset models | EVALUATE (Phase 6) |
| OpenClaw gateway, TUI/tmux visualisation, telemetry | OpenCode/TUI only | no DSH equivalent (web UI, terminal tools) | NOT PLANNED |

## Phase 1 (landed): keyword mode routing

- One mode registry in priority order: `hyperplan-ultrawork` (suppresses its single modes),
  `hyperplan` (`hyperplan` and `hpp`, with C++ `.hpp` and identifier suffixes excluded), `team mode`
  (`team mode`, `team-mode`, `team_mode`, `teammode`), and `ultrawork`.
- Per-mode pointers and source kinds; namespaced runtime skills (`omo-ultrawork`, `omo-hyperplan`);
  the team pointer maps the mode onto native DSH Agent Teams.
- Shared scrub pipeline: code spans, URLs, negated mentions (English and Chinese), URL/path/identifier
  boundary guards, child-session silence, and per-mode retry dedupe.
- `search` and `analyze` are not ported: the OpenCode adapter removed those modes, leaving only a
  removed-wording test.
- Acceptance met: unit matrix per mode (47 tests), live runs for team, hyperplan, `.hpp` negative,
  combined invocation, and an ultrawork regression, catalog delta proving only namespaced additions,
  and a merged PR.

## Phase 2 (landed for harness-neutral workflows): skill library

- Batch 1 landed (PR #6): `omo-git-master`, `omo-debugging`, `omo-remove-ai-slops`.
- Batch 2 landed (PR #7): `omo-data-scientist`, `omo-review-work`, `omo-init-deep`, all adapted from
  `shared-skills` to the DSH tool surface (no `task`, `lsp_*`, `background_output`, ast-grep, or
  OpenCode-only config). Registered through the same seam as the mode skills; config gate
  `skills: { library: false }`.
- Batch 3 landed (PR #10): `omo-ulw-plan` (explore-first decision-complete planning),
  `omo-ulw-execute` (orchestrator-only plan execution with worktree discipline, unit decomposition,
  parallel subagents or workflows, and per-unit evidence), `omo-ulw-research` (claim-graph research
  with source-tier gating and a cited deliverable), `omo-programming` (language-gated practice for
  Python, Rust, TypeScript, and Go), `omo-refactor` (behavior-locked refactors with atomic green
  steps), and `omo-frontend` (design-quality frontend with route-before-code, component states, and
  an anti-slop list). Each body is a condensed self-contained directive; the original reference
  packs and helper scripts stay in the repository instead of being copied into the bundle.
- Batch 4 (tool-bound, Phase 4): `ast-grep`, `lsp-setup`, `browser`, `ultimate-browsing`,
  `visual-qa`, `coding-agent-sessions` follow the Phase 4 tool mapping.
- Acceptance for every batch: the skill loads through the `skill` tool in a live session, the
  catalog diff shows only namespaced additions, and no shipped body references a tool the target
  profile lacks.

## Phase 3 (landed at the DSH boundary): agent roles as DSH presets

- Batch 1 landed (PR #8): `omo-prometheus` (planner), `omo-oracle` (advisor), `omo-librarian` (research),
  and `omo-explore` (codebase search) as bundle-carried `@deepseek-ai/dsh-agent-preset` declarations.
  Each composes a complete persona prefix with the read-only tool surface for the role; all four are
  non-default and selectable from the Desktop roster.
- Batch 2 landed (PR #9): `omo-sisyphus` and `omo-atlas` full-tool orchestrators, plus the read-only
  `omo-metis` (pre-planning critic), `omo-momus` (plan reviewer), and `omo-multimodal-looker`
  (visual analysis). All nine OMO presets are non-default and selectable from the Desktop roster.
- Batch 3 decision (documented non-port): `hephaestus` is a provider-specific deep worker whose value
  comes from OmO's per-provider model table, and `sisyphus-junior` is a category executor whose value
  comes from OmO's category-to-model routing. DSH exposes neither as a preset concern: a session's
  model is chosen at session level, and a preset cannot carry routing. Shipping them as plain
  full-tool presets would duplicate `omo-sisyphus` without their defining behavior, so they are
  recorded as not portable here. If DSH later exposes per-agent model routing, revisit this row.
- Acceptance: preset mounts and activates in a registry-mounting profile, appears in the roster, a
  live session selects it and shows the role behavior with the intended tool surface, and the
  unmodified default preset still works.

## Phase 4 (in progress): hooks and tools

- Batch 1 landed (PR #11): rules injection on `agent/pre-step` and the comment check on
  `tools/post-execute`. Rules read `.omo/rules/*.md` plus `~/.omo/rules`, parse the frontmatter subset
  (`description`, `globs`, `alwaysApply`), inject once per rule per session, and fail open. The
  comment check flags restating narration, filler, banners, commented-out code, and em dashes in
  added `write`/`edit` text, then attaches a capped warning context instead of blocking a tool that
  already ran.
- Batch 2 landed (PR #12): `omo-ast-grep` (structural search and codemods through `sg`), `omo-lsp-setup`
  (build the repository's `lsp-tools-mcp`, verify the stdio handshake, register the MCP client row, and
  confirm `mcp__lsp__*` tools), and `omo-coding-agent-sessions` (read local agent transcripts across
  harnesses). The LSP row stays profile-level on purpose: a bundle patch cannot carry a portable
  absolute path to the built server. `browser`, `ultimate-browsing`, and `visual-qa` are documented as
  not portable because they bind to OmO's own browser engine, which DSH does not ship.
- Hashline: not ported. DSH's filesystem tools already carry a version guard and expose
  `fs/write-intent` / `fs/edit-intent` waterfalls, so a parallel hash protocol would conflict with
  the Host's own edit safety.
- Acceptance: each hook/tool is proven by a live event or tool call, not by unit tests alone.

## Phase 5 (partial): team mode and parallel execution

- The `team mode` keyword already injects a pointer that maps the mode onto native DSH Agent Teams
  (`team_task_create`, `spawn_teammate`, `send_message`, `wait_agent`, `team_task_update`), and the
  hyperplan directive drives a five-member adversarial team through the same tools.
- Remaining: a real multi-member run with evidence (board state, member replies, final aggregation)
  and a parallel `workflow` run, both recorded under `.omo/evidence/`.
- Acceptance: a live session creates tasks, spawns members, collects their work, and closes the board;
  no duplicated work and no orphaned members.

## Phase 6 (in progress): configuration and routing

- Batch 1 landed (PR #13): the adapter reads the shared OmO config (`~/.omo/omo.json[c]` plus the
  nearest project `.omo/omo.json[c]`, JSONC) and merges its `dsh` block under the row config. Only the
  `dsh` block is read so another harness's same-named key cannot change DSH behavior; invalid files
  fall back to the row with a warning. Skill registration stays activation-time, so the file cannot
  toggle skills.
- Remaining: model routing evaluation (DSH selects models per session, presets cannot carry routing),
  and a read-only status surface for the adapter's effective config.
