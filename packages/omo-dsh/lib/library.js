/**
 * The OmO skill library ported to DeepSeek Harness.
 *
 * Batch 1 ships the harness-neutral workflows that do not need an OpenCode-only
 * tool: `git-master`, `debugging`, and `remove-ai-slops`. Batch 2 adds the
 * documentation, review, and data workflows: `init-deep`, `review-work`, and
 * `data-scientist`. Each body is adapted to the DSH tool surface (bash, read,
 * write, edit, grep, glob, subagent, jobs, terminal) instead of the OpenCode
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
