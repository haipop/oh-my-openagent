/**
 * The OmO skill library ported to DeepSeek Harness.
 *
 * Batch 1 ships the harness-neutral workflows that do not need an OpenCode-only
 * tool: `git-master`, `debugging`, and `remove-ai-slops`. Each body is adapted to
 * the DSH tool surface (bash, read, write, edit, grep, glob, subagent, jobs)
 * instead of the OpenCode tools (`task`, `lsp_*`, `background_output`).
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
