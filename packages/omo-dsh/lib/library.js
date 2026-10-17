/**
 * The OmO skill library ported to DeepSeek Harness.
 *
 * Batch 1 ships the harness-neutral workflows that do not need an OpenCode-only
 * tool: `git-master`, `debugging`, and `remove-ai-slops`. Batch 2 adds the
 * documentation, review, and data workflows: `init-deep`, `review-work`, and
 * `data-scientist`. Batch 3 adds the OMO workflow set the agent roles unblocked:
 * `ulw-plan`, `ulw-execute`, `ulw-research`, `programming`, `refactor`, and
 * `frontend`. Each body is adapted to the DSH tool surface (bash, read, write,
 * edit, grep, glob, subagent, workflow, jobs, todo_write) instead of the OpenCode
 * tools (`task`, `lsp_*`, `background_output`).
 *
 * Names are namespaced (`omo-*`) for the same reason the mode skills are: user
 * and project skill layers outrank runtime registrations.
 *
 * @module @oh-my-opencode/omo-dsh/library
 */

import { loadSkillFromFile } from "./skill.js"

/** Skill library entries, in registration order. */
export const SKILL_LIBRARY = Object.freeze([
  Object.freeze({
    id: "git-master",
    name: "omo-git-master",
    file: "git-master.md",
    description:
      "OmO git-master workflow for DeepSeek Harness: mode gate (commit/rebase/history/status), ground-truth inspection, atomic commit grouping, safe history rewriting, and blame/bisect/reflog investigation with cited evidence.",
    whenToUse:
      "When the user asks to commit, rebase, squash, bisect, blame, or answer a git-history question on DeepSeek Harness.",
  }),
  Object.freeze({
    id: "debugging",
    name: "omo-debugging",
    file: "debugging.md",
    description:
      "OmO debugging workflow for DeepSeek Harness: hypothesis-driven loop, runtime truth over code reading, orthogonal oracle angles, failing-test lock, and escalation when the bug does not reproduce.",
    whenToUse:
      "When the user reports a crash, silent failure, hang, leak, async misbehavior, wrong response, or reverse-engineering problem on DeepSeek Harness.",
  }),
  Object.freeze({
    id: "remove-ai-slops",
    name: "omo-remove-ai-slops",
    file: "remove-ai-slops.md",
    description:
      "OmO remove-ai-slops workflow for DeepSeek Harness: audit recent branch changes for AI-generated code smells behind regression tests, with a slop taxonomy, detection heuristics, and atomic cleanup discipline.",
    whenToUse:
      "When the user asks to clean up, deslop, or remove AI-generated code smells from recent changes on DeepSeek Harness.",
  }),
  Object.freeze({
    id: "data-scientist",
    name: "omo-data-scientist",
    file: "data-scientist.md",
    description:
      "OmO data-scientist workflow for DeepSeek Harness: hybrid-engine discipline (DuckDB, Polars, pandas, or plain shell), schema and quality checks first, one command per reported number, reproducible analysis notes, and caveats in every report.",
    whenToUse:
      "When the user asks to analyze CSV/parquet/JSON data, run group-by, join, aggregation, or time-series work, clean a dataset, or plot it on DeepSeek Harness.",
  }),
  Object.freeze({
    id: "review-work",
    name: "omo-review-work",
    file: "review-work.md",
    description:
      "OmO review-work gate for DeepSeek Harness: the orchestrator runs manual QA on the real surface first, then one gate reviewer subagent audits goal fit, constraints, code quality, security, missed context, and the QA evidence before a BLOCK, PASS WITH FIXES, or PASS verdict.",
    whenToUse:
      "When the user asks to review completed work, or before a PR handoff, on DeepSeek Harness.",
  }),
  Object.freeze({
    id: "init-deep",
    name: "omo-init-deep",
    file: "init-deep.md",
    description:
      "OmO init-deep workflow for DeepSeek Harness: scan a repository, complexity-score directories, and write hierarchical AGENTS.md files whose commands, conventions, and where-to-look sections were verified against the real tree.",
    whenToUse:
      "When a repository needs agent-facing documentation (root and per-directory AGENTS.md) on DeepSeek Harness.",
  }),
  Object.freeze({
    id: "ulw-plan",
    name: "omo-ulw-plan",
    file: "ulw-plan.md",
    description:
      "OmO ulw-plan workflow for DeepSeek Harness: explore-first planning consultant that writes one decision-complete plan with per-step verification, non-goals, risks, and a handoff block, and never implements.",
    whenToUse:
      "When the user asks for a plan, design, or work breakdown before implementation, or invokes ulw-plan, on DeepSeek Harness.",
  }),
  Object.freeze({
    id: "ulw-execute",
    name: "omo-ulw-execute",
    file: "ulw-execute.md",
    description:
      "OmO ulw-execute workflow for DeepSeek Harness: orchestrator-only execution of a written plan with worktree discipline, unit decomposition, parallel subagents or workflows, per-unit evidence, and integration verification.",
    whenToUse:
      "When the user asks to execute a written plan or invokes ulw-execute on DeepSeek Harness.",
  }),
  Object.freeze({
    id: "ulw-research",
    name: "omo-ulw-research",
    file: "ulw-research.md",
    description:
      "OmO ulw-research workflow for DeepSeek Harness: maximum-saturation research with parallel lanes, a claim graph that separates evidence from inference, source-tier gating, and a cited deliverable that names what stays unknown.",
    whenToUse:
      "When the user asks for research, a deep investigation, or a state-of-the-art survey on DeepSeek Harness.",
  }),
  Object.freeze({
    id: "programming",
    name: "omo-programming",
    file: "programming.md",
    description:
      "OmO programming workflow for DeepSeek Harness: a language gate plus strict per-language practice for Python, Rust, TypeScript, and Go, with typed errors, exhaustive matching, tests that can fail, and honest sizing.",
    whenToUse:
      "When the work touches Python, Rust, TypeScript, or Go source and the user expects production-quality code on DeepSeek Harness.",
  }),
  Object.freeze({
    id: "refactor",
    name: "omo-refactor",
    file: "refactor.md",
    description:
      "OmO refactor workflow for DeepSeek Harness: behavior-locked refactors with a contract, decomposition strategy, atomic green steps, before-and-after measurement, and cleanup rules that ban mixed-scope diffs.",
    whenToUse:
      "When the user asks to refactor, simplify, extract, restructure, or modernize code on DeepSeek Harness.",
  }),
  Object.freeze({
    id: "frontend",
    name: "omo-frontend",
    file: "frontend.md",
    description:
      "OmO frontend workflow for DeepSeek Harness: route the design concerns before writing code, hold the senior-designer bar with token foundations, component states, motion discipline, accessibility, and an anti-slop list.",
    whenToUse:
      "When the task involves a page, component, layout, styling, animation, or visual quality on DeepSeek Harness.",
  }),
  Object.freeze({
    id: "ast-grep",
    name: "omo-ast-grep",
    file: "ast-grep.md",
    description:
      "OmO ast-grep workflow for DeepSeek Harness: structural search and codemods through the sg CLI with a presence gate, pattern capture rules, YAML rules for repeated judgment, preview-before-rewrite discipline, and post-rewrite verification.",
    whenToUse:
      "When the target is a syntax shape (every call, class, import, or attribute shaped like X), a codemod, or a structural rule on DeepSeek Harness.",
  }),
  Object.freeze({
    id: "lsp-setup",
    name: "omo-lsp-setup",
    file: "lsp-setup.md",
    description:
      "OmO lsp-setup workflow for DeepSeek Harness: build the repository's lsp-tools-mcp server, verify its stdio tools/list handshake, register it as a @deepseek-ai/dsh-mcp-client row on a profile, and confirm the mcp__lsp__* tools end to end.",
    whenToUse:
      "When the user wants language-server capabilities (diagnostics, definitions, references, rename) in DeepSeek Harness, or hits a no-LSP gap.",
  }),
  Object.freeze({
    id: "coding-agent-sessions",
    name: "omo-coding-agent-sessions",
    file: "coding-agent-sessions.md",
    description:
      "OmO coding-agent-sessions workflow for DeepSeek Harness: locate, decompress, and read past sessions from DSH, Codex, Claude Code, OpenCode, and OMO/Senpi without mutating their stores, reconstruct what actually happened, and cite session ids with sequence numbers.",
    whenToUse:
      "When asked to find, read, reconstruct, or compare past coding-agent sessions or transcripts on DeepSeek Harness.",
  }),
])

/**
 * Load every library skill.
 *
 * @returns {ReadonlyArray<Readonly<{ name: string, description: string, whenToUse: string, source: "runtime", content: string }>>} skill definitions.
 */
export function loadLibrarySkills() {
  return SKILL_LIBRARY.map((entry) =>
    loadSkillFromFile({
      name: entry.name,
      file: entry.file,
      description: entry.description,
      whenToUse: entry.whenToUse,
    }),
  )
}

/** Namespaced name for one library entry id. */
export const SKILL_LIBRARY_NAMES = Object.freeze(SKILL_LIBRARY.map((entry) => entry.name))
