/**
 * DeepSeek Harness Host bundle for OmO's keyword modes.
 *
 * Two registrations, both on documented Harness seams:
 * - `ctx.skills.register` publishes each directive as a uniquely named runtime
 *   skill (`omo-ultrawork`, `omo-hyperplan`), so the model can load a body on
 *   demand with the `skill` tool without colliding with a user's own skill.
 * - a prepended `agent/pre-step` waterfall listener appends one synthetic
 *   sourced `user/message` carrying the matched mode's bootstrap pointer when a
 *   human prompt invokes that mode. The injection is durable session history, so
 *   replay, fork, and resume see exactly what the model saw.
 *
 * A matched message is remembered per live session and per mode, so a step
 * retried after a pre-commit failure cannot append a second pointer.
 *
 * @module @oh-my-opencode/omo-dsh
 */

import { randomUUID } from "node:crypto"

import { buildKeywordPattern, DEFAULT_KEYWORDS, isChildAgent } from "./lib/detect.js"
import { buildModes, findModeMatch } from "./lib/modes.js"
import { createModeMessage, isModeMessage } from "./lib/pointer.js"
import { loadHyperplanSkill, loadUltraworkSkill } from "./lib/skill.js"

/** Cordis plugin name; matches the `omo-ultrawork` row in `cordis.patch.yml`. */
export const name = "omo-ultrawork"

/** The bundle needs the skill registry; without it the plugin stays inactive. */
export const inject = ["skills"]

const KNOWN_CONFIG_KEYS = new Set(["enabled", "keywords", "applyToSubagents", "modes"])
const KNOWN_MODE_KEYS = new Set(["ultrawork", "team", "hyperplan", "hyperplanUltrawork"])

/** Upper bound on remembered arming keys per live session; a live session rarely exceeds it. */
const ARMED_MESSAGES_LIMIT = 1024

/** One arming ledger per live session object; the entry disappears with the session. */
const armedMessagesBySession = new WeakMap()

function alreadyArmed(session, key) {
  if (session === undefined || session === null) return false
  const armed = armedMessagesBySession.get(session)
  return armed !== undefined && armed.has(key)
}

function armMessage(session, key) {
  if (session === undefined || session === null) return
  let armed = armedMessagesBySession.get(session)
  if (armed === undefined) {
    armed = new Set()
    armedMessagesBySession.set(session, armed)
  }
  if (armed.size > ARMED_MESSAGES_LIMIT) armed.clear()
  armed.add(key)
}

function resolveModes(raw) {
  const modes = { ultrawork: true, team: true, hyperplan: true, hyperplanUltrawork: true }
  if (raw === undefined) return modes
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("omo-ultrawork: config.modes must be an object")
  }
  for (const key of Object.keys(raw)) {
    if (!KNOWN_MODE_KEYS.has(key)) {
      throw new TypeError(`omo-ultrawork: unknown config.modes key "${key}"`)
    }
    if (typeof raw[key] !== "boolean") {
      throw new TypeError(`omo-ultrawork: config.modes.${key} must be a boolean`)
    }
    modes[key] = raw[key]
  }
  if (modes.hyperplanUltrawork && !modes.hyperplan) modes.hyperplanUltrawork = false
  return modes
}

function resolveOptions(config) {
  const raw = config ?? {}
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("omo-ultrawork: config must be an object")
  }
  for (const key of Object.keys(raw)) {
    if (!KNOWN_CONFIG_KEYS.has(key)) {
      throw new TypeError(`omo-ultrawork: unknown config key "${key}"`)
    }
  }
  const enabled = raw.enabled ?? true
  if (typeof enabled !== "boolean") throw new TypeError("omo-ultrawork: config.enabled must be a boolean")
  const applyToSubagents = raw.applyToSubagents ?? false
  if (typeof applyToSubagents !== "boolean") {
    throw new TypeError("omo-ultrawork: config.applyToSubagents must be a boolean")
  }
  const keywords = raw.keywords ?? DEFAULT_KEYWORDS
  if (!Array.isArray(keywords) || keywords.length === 0) {
    throw new TypeError("omo-ultrawork: config.keywords must be a non-empty array of strings")
  }
  for (const keyword of keywords) {
    if (typeof keyword !== "string" || keyword.trim().length === 0) {
      throw new TypeError("omo-ultrawork: config.keywords must be a non-empty array of strings")
    }
  }
  return {
    enabled,
    applyToSubagents,
    keywords,
    ultraworkPattern: buildKeywordPattern(keywords),
    enabledModes: resolveModes(raw.modes),
  }
}

function registerSkills(ctx, enabledModes) {
  if (enabledModes.ultrawork || enabledModes.hyperplanUltrawork) {
    ctx.skills.register(loadUltraworkSkill())
  }
  if (enabledModes.hyperplan || enabledModes.hyperplanUltrawork) {
    ctx.skills.register(loadHyperplanSkill())
  }
}

/**
 * Activate the bundle in the current Host composition.
 *
 * @param {object} ctx - Cordis context of the mounted plugin row.
 * @param {unknown} config - row config from `cordis.patch.yml`.
 */
export function apply(ctx, config) {
  const options = resolveOptions(config)
  if (!options.enabled) return

  registerSkills(ctx, options.enabledModes)
  const modes = buildModes(options)

  ctx.on(
    "agent/pre-step",
    async (payload, next) => {
      const decision = await next()
      if (decision.kind !== "enter") return decision
      if (payload.signal?.aborted === true) return decision
      try {
        if (!options.applyToSubagents && isChildAgent(payload.agent)) return decision
        if (decision.messages.some(isModeMessage)) return decision
        const match = findModeMatch(decision.messages, modes)
        if (match === undefined) return decision
        const messageId = match.message?.id
        if (typeof messageId !== "string" || messageId.length === 0) return decision
        const armKey = `${match.mode.id}:${messageId}`
        const session = payload.agent?.session
        if (alreadyArmed(session, armKey)) return decision
        const injected = createModeMessage({
          id: randomUUID(),
          pointer: match.mode.buildPointer(),
          kind: match.mode.sourceKind,
          summary: match.mode.summary,
        })
        armMessage(session, armKey)
        return { ...decision, messages: [...decision.messages, injected] }
      } catch (error) {
        ctx.logger?.warn?.("omo-ultrawork: mode pointer injection skipped: %o", error)
        return decision
      }
    },
    { prepend: true },
  )
}
