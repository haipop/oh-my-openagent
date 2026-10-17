/**
 * Runtime skill definitions served to the DeepSeek Harness skill registry.
 *
 * Registered names are namespaced (`omo-<capability>`) on purpose: user and
 * project skill layers outrank runtime registrations, and bare names such as
 * `ultrawork` often exist in the user's own skill set, so a shared name would
 * make an injected pointer load someone else's directive.
 *
 * Bodies live in `skills/*.md` so they stay reviewable as prose; the plugin
 * reads them from the bundle directory at activation. Local directory
 * installation links the checkout, and a packed install ships `skills/` through
 * the package `files` list, so the read works in both shapes.
 *
 * @module @oh-my-opencode/omo-dsh/skill
 */

import { readFileSync } from "node:fs"

/** Unique ultrawork skill name the pointer tells the model to load. */
export const ULTRAWORK_SKILL_NAME = "omo-ultrawork"

/** Unique hyperplan skill name the pointer tells the model to load. */
export const HYPERPLAN_SKILL_NAME = "omo-hyperplan"

const SKILLS_ROOT_URL = new URL("../skills/", import.meta.url)

/**
 * Load one shipped directive by file name and build the runtime skill registration.
 *
 * @param {{ name: string, file: string, description: string, whenToUse: string }} input - skill identity and location.
 * @throws {Error} when the shipped directive is missing or empty.
 * @returns {Readonly<{ name: string, description: string, whenToUse: string, source: "runtime", content: string }>} skill definition.
 */
export function loadSkillFromFile(input) {
  const url = new URL(input.file, SKILLS_ROOT_URL)
  const content = readFileSync(url, "utf8").trim()
  if (content.length === 0) {
    throw new Error(`omo-dsh: ${input.file} is empty`)
  }
  return Object.freeze({
    name: input.name,
    description: input.description,
    whenToUse: input.whenToUse,
    source: "runtime",
    content,
  })
}

/**
 * Load the ultrawork directive as the `omo-ultrawork` runtime skill.
 *
 * @returns {Readonly<{ name: string, description: string, whenToUse: string, source: "runtime", content: string }>} skill definition.
 */
export function loadUltraworkSkill() {
  return loadSkillFromFile({
    name: ULTRAWORK_SKILL_NAME,
    file: "ultrawork.md",
    description:
      "OmO ultrawork-mode directive for DeepSeek Harness: tier triage, goal registration, durable notepad, READ/CHANGE/RUN/CLEAN loop, real-surface verification, and completion discipline.",
    whenToUse:
      "When the injected <ultrawork-mode> bootstrap names it, or when the user asks for OmO's ultrawork mode on DeepSeek Harness.",
  })
}

/**
 * Load the hyperplan directive as the `omo-hyperplan` runtime skill.
 *
 * @returns {Readonly<{ name: string, description: string, whenToUse: string, source: "runtime", content: string }>} skill definition.
 */
export function loadHyperplanSkill() {
  return loadSkillFromFile({
    name: HYPERPLAN_SKILL_NAME,
    file: "hyperplan.md",
    description:
      "OmO hyperplan mode for DeepSeek Harness: a five-member adversarial team (skeptic, validator, researcher, architect, creative) runs independent analysis, cross-attack, and defense rounds, then a fresh subagent formalizes only the surviving insights into an executable plan.",
    whenToUse:
      "When the injected <hyperplan-mode> or <hyperplan-ultrawork-mode> bootstrap names it, or when the user asks for adversarial planning on DeepSeek Harness.",
  })
}
