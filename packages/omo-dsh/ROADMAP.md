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
| keyword mode routing | OpenCode `keyword-detector` (ultrawork / team / hyperplan / hyperplan-ultrawork; search and analyze were removed upstream) | one mode registry on the same injection seam, per-mode pointers, namespaced runtime skills, per-mode config | LANDED (Phase 1) |
| skill library | `shared-skills` (17 skills) + OpenCode builtin skills | `ctx.skills.register` per adapted skill | NEXT (Phase 2) |
| agent roles | 11 agents + category routing (`model-core`, `delegate-core`) | DSH agent presets (YAML composition) + subagent model selection | PLANNED (Phase 3) |
| rules injection | `rules-engine` + `rules-injector` hook | DSH `agent-instructions` covers AGENTS.md; add `.omo/rules` via projected context | EVALUATE (Phase 4) |
| comment checker | `comment-checker-core` + binary | `tools/post-execute` hook + bundled checker | PLANNED (Phase 4) |
| LSP tools | `lsp-tools-mcp` (8 tool aliases) | MCP server row in the profile bundle | PLANNED (Phase 4) |
| hashline edit | `hashline-core` + patched edit tool | DSH edit tool has its own protocol | EVALUATE |
| team mode | OpenCode 12 `team_*` tools + mailbox/lockstep engine | DSH Agent Teams is native; keyword pointer lands in Phase 1, prompts/skills in Phase 5 | PARTIAL (Phase 1) |
| task delegation, background agents | `delegate-core`, background-agent feature | native `subagent`, `workflow`, `bash` jobs | NATIVE (guidance only) |
| todo + goal | OpenCode tools | native `todo_write`, `create_goal`/`update_goal`/`get_goal` | NATIVE |
| config | `omo-config-core` (`~/.omo/omo.json[c]`) | adapter reads its own keys from the same file | PLANNED (Phase 6) |
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

## Phase 2 (next): skill library

- Batch 1: skills with no harness-specific tools (methodology and review skills); copy the body,
  adapt tool names, register in one bundle, namespace collisions checked against the live catalog.
- Batch 2: skills that depend on file/search/terminal tools; adapt per DSH tool surface.
- Acceptance: every shipped skill loads through the `skill` tool in a live session; a catalog diff
  proves only namespaced additions; per-skill smoke prompt.

## Phase 3: agent roles as DSH presets

- Map Prometheus (plan), Oracle (review), Librarian/Explore (research), Metis/Momus (plan critique)
  to DSH agent presets with tuned prompts; wire category-style model selection where DSH exposes it.
- Acceptance: preset mounts, a live session selects it, role behavior observed, and the unmodified
  default preset still works.

## Phase 4: hooks and tools

- Rules injection from `.omo/rules` (or documented alternative), comment checker on `tools/post-execute`,
  LSP MCP registration, hashline decision after evaluating the DSH edit protocol.
- Acceptance: each hook/tool proven by a live event or tool call, not by unit tests alone.

## Phase 5: team and parallel

- Port OmO's team prompts/skills onto DSH Agent Teams instead of the OpenCode mailbox engine; document
  the differences. Evaluate whether any OpenCode team tool has no DSH equivalent.
- Acceptance: a real multi-member run with a shared task board and a completed deliverable.

## Phase 6: config, routing, and status

- Read the adapter's keys from `~/.omo/omo.json[c]` (user layer only, project layer opt-in), map
  model routing where DSH allows it, and expose a read-only status tool.
- Acceptance: config precedence tests, a live reconfiguration run, and a documented migration path.

## Per-phase definition of done

1. Unit tests pin the new contract.
2. `bun run typecheck` and the repository audits stay green.
3. A live DSH run through the real model proves the user-visible behavior.
4. A Chinese audit note with artifact hashes lands in the local evidence directory.
5. The PR merges with a merge commit and the running profiles are relinked to the merged checkout.
