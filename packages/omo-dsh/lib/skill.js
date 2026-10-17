/**
 * The runtime skill definition served to the DeepSeek Harness skill registry.
 *
 * The registered name is `omo-ultrawork` on purpose. User and project skill
 * layers outrank runtime registrations, and `ultrawork` often exists in the
 * user's own skill set, so a shared name would make the injected pointer load
 * someone else's directive.
 *
 * The body lives in `skills/ultrawork.md` so it stays reviewable as prose; the
 * plugin reads it from the bundle directory at activation. Local directory
 * installation links the checkout, and a packed install ships `skills/` through
 * the package `files` list, so the read works in both shapes.
 *
 * @module @oh-my-opencode/omo-dsh/skill
 */

import { readFileSync } from "node:fs"

const SKILL_BODY_URL = new URL("../skills/ultrawork.md", import.meta.url)

/** Unique skill name the pointer tells the model to load. */
export const ULTRAWORK_SKILL_NAME = "omo-ultrawork"

/** One-line routing description shown in the model's skill catalog. */
export const ULTRAWORK_SKILL_DESCRIPTION =
  "OmO ultrawork-mode directive for DeepSeek Harness: tier triage, goal registration, durable notepad, READ/CHANGE/RUN/CLEAN loop, real-surface verification, and completion discipline."

/** When the catalog should route to this skill. */
export const ULTRAWORK_SKILL_WHEN_TO_USE =
  "When the injected <ultrawork-mode> bootstrap names it, or when the user asks for OmO's ultrawork mode on DeepSeek Harness."

/**
 * Load the directive body and build the runtime skill registration.
 *
 * @throws {Error} when the shipped directive is missing or empty.
 * @returns {Readonly<{ name: string, description: string, whenToUse: string, source: "runtime", content: string }>} skill definition.
 */
export function loadUltraworkSkill() {
  const content = readFileSync(SKILL_BODY_URL, "utf8").trim()
  if (content.length === 0) {
    throw new Error("omo-dsh: skills/ultrawork.md is empty")
  }
  return Object.freeze({
    name: ULTRAWORK_SKILL_NAME,
    description: ULTRAWORK_SKILL_DESCRIPTION,
    whenToUse: ULTRAWORK_SKILL_WHEN_TO_USE,
    source: "runtime",
    content,
  })
}
