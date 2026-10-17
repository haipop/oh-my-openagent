/**
 * Keyword modes served by the bundle, in injection priority order.
 *
 * A mode owns one activation pattern, one negation-keyword list for the shared
 * scrub pipeline, one pointer, and the runtime skills it needs. The first mode
 * that matches the entering batch injects exactly one pointer.
 *
 * The OMO modes are the ones the OpenCode adapter ships today: `ultrawork`,
 * `team mode`, `hyperplan` (with `hpp` shorthand), and the combined
 * `hyperplan + ultrawork` invocation. `search` and `analyze` were removed from
 * OMO and are not ported.
 *
 * @module @oh-my-opencode/omo-dsh/modes
 */

import { createGuardedPattern, DEFAULT_KEYWORDS, hasKeyword, isUserAuthoredMessage, messageText } from "./detect.js"
import {
  buildHyperplanPointer,
  buildHyperplanUltraworkPointer,
  buildTeamPointer,
  buildUltraworkPointer,
  HYPERPLAN_SOURCE_KIND,
  HYPERPLAN_ULTRAWORK_SOURCE_KIND,
  TEAM_SOURCE_KIND,
  ULTRAWORK_SOURCE_KIND,
} from "./pointer.js"
import { HYPERPLAN_SKILL_NAME, ULTRAWORK_SKILL_NAME } from "./skill.js"

/** Mode ids in injection priority order, highest first. */
export const MODE_PRIORITY = Object.freeze(["hyperplan-ultrawork", "hyperplan", "team", "ultrawork"])

/** Team-mode keyword core: `team mode`, `team-mode`, `team_mode`, `teammode`. */
const TEAM_PATTERN_CORE = "team[\\s_-]?mode"

/** Hyperplan keyword core: `hyperplan`, plus `hpp` that is not a file extension or identifier suffix. */
const HYPERPLAN_PATTERN_CORE = "hyperplan|(?<![\\w.])hpp"

/** Combined hyperplan+ultrawork core: strict adjacency, both word orders. */
const HYPERPLAN_ULTRAWORK_PATTERN_CORE =
  "(?:hpp|hyperplan)\\s+(?:ultrawork|ulw(?!-\\w))|(?:ultrawork|ulw(?!-\\w))\\s+(?:hpp|hyperplan)"

/** Team-mode negation keywords for the shared scrub pipeline. */
const TEAM_NEGATION_KEYWORDS = Object.freeze(["team mode", "team-mode", "team_mode", "teammode"])

/** Hyperplan negation keywords for the shared scrub pipeline. */
const HYPERPLAN_NEGATION_KEYWORDS = Object.freeze(["hyperplan", "hpp"])

function ultraworkMode(options) {
  return {
    id: "ultrawork",
    sourceKind: ULTRAWORK_SOURCE_KIND,
    pattern: options.ultraworkPattern,
    negationKeywords: options.keywords,
    summary: "ultrawork mode activated",
    buildPointer: () => buildUltraworkPointer({ skillName: ULTRAWORK_SKILL_NAME }),
  }
}

function teamMode() {
  return {
    id: "team",
    sourceKind: TEAM_SOURCE_KIND,
    pattern: createGuardedPattern(TEAM_PATTERN_CORE),
    negationKeywords: TEAM_NEGATION_KEYWORDS,
    summary: "team mode activated",
    buildPointer: buildTeamPointer,
  }
}

function hyperplanMode() {
  return {
    id: "hyperplan",
    sourceKind: HYPERPLAN_SOURCE_KIND,
    pattern: createGuardedPattern(HYPERPLAN_PATTERN_CORE),
    negationKeywords: HYPERPLAN_NEGATION_KEYWORDS,
    summary: "hyperplan mode activated",
    buildPointer: () => buildHyperplanPointer({ skillName: HYPERPLAN_SKILL_NAME }),
  }
}

function hyperplanUltraworkMode() {
  return {
    id: "hyperplan-ultrawork",
    sourceKind: HYPERPLAN_ULTRAWORK_SOURCE_KIND,
    pattern: createGuardedPattern(HYPERPLAN_ULTRAWORK_PATTERN_CORE),
    negationKeywords: [],
    summary: "hyperplan ultrawork mode activated",
    buildPointer: () =>
      buildHyperplanUltraworkPointer({
        ultraworkSkillName: ULTRAWORK_SKILL_NAME,
        hyperplanSkillName: HYPERPLAN_SKILL_NAME,
      }),
  }
}

/**
 * Build the enabled mode list for one activation.
 *
 * @param {{ enabledModes: { ultrawork: boolean, team: boolean, hyperplan: boolean, hyperplanUltrawork: boolean }, keywords: readonly string[], ultraworkPattern: RegExp }} options - resolved activation options.
 * @returns {readonly object[]} enabled modes in priority order.
 */
export function buildModes(options) {
  const enabled = options.enabledModes
  const modes = []
  if (enabled.hyperplanUltrawork) modes.push(hyperplanUltraworkMode())
  if (enabled.hyperplan) modes.push(hyperplanMode())
  if (enabled.team) modes.push(teamMode())
  if (enabled.ultrawork) modes.push(ultraworkMode(options))
  return modes
}

/**
 * Find the first mode and human message that invoke a mode, in priority order.
 *
 * Combo modes suppress their single-mode counterparts because the first match
 * wins; a prompt that names both hyperplan and ultrawork yields only the combo.
 *
 * @param {readonly unknown[]} messages - messages entering the step.
 * @param {readonly object[]} modes - enabled modes in priority order.
 * @returns {{ mode: object, message: unknown } | undefined} the winning mode and its message.
 */
export function findModeMatch(messages, modes) {
  if (!Array.isArray(messages)) return undefined
  for (const mode of modes) {
    for (const message of messages) {
      if (!isUserAuthoredMessage(message)) continue
      if (!hasKeyword(messageText(message), mode.pattern, mode.negationKeywords)) continue
      return { mode, message }
    }
  }
  return undefined
}

/**
 * Skills a mode needs registered.
 *
 * @param {string} modeId - mode id.
 * @returns {readonly string[]} runtime skill names.
 */
export function modeSkillNames(modeId) {
  if (modeId === "ultrawork") return [ULTRAWORK_SKILL_NAME]
  if (modeId === "hyperplan" || modeId === "hyperplan-ultrawork") return [HYPERPLAN_SKILL_NAME]
  return []
}

export { DEFAULT_KEYWORDS }
