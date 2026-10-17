/**
 * DeepSeek Harness Host bundle for OmO's ultrawork mode (`ulw` / `ultrawork`).
 *
 * Two registrations, both on documented Harness seams:
 * - `ctx.skills.register` publishes the full directive as the uniquely named
 *   `omo-ultrawork` runtime skill, so the model can load the body on demand with
 *   the `skill` tool without colliding with a user's own `ultrawork` skill.
 * - a prepended `agent/pre-step` waterfall listener appends a synthetic sourced
 *   `user/message` carrying the compact bootstrap pointer when a human prompt
 *   invokes the mode. The injection is durable session history, so replay, fork,
 *   and resume see exactly what the model saw.
 *
 * A message that already armed the mode is remembered for its live session, so a
 * step retried after a pre-commit failure cannot append a second pointer.
 *
 * @module @oh-my-opencode/omo-dsh
 */

import { randomUUID } from "node:crypto"

import { DEFAULT_KEYWORDS, buildKeywordPattern, findKeywordMessages, isChildAgent } from "./lib/detect.js"
import { buildUltraworkPointer, createUltraworkMessage, isUltraworkMessage } from "./lib/pointer.js"
import { ULTRAWORK_SKILL_NAME, loadUltraworkSkill } from "./lib/skill.js"

/** Cordis plugin name; matches the `omo-ultrawork` row in `cordis.patch.yml`. */
export const name = "omo-ultrawork"

/** The bundle needs the skill registry; without it the plugin stays inactive. */
export const inject = ["skills"]

const KNOWN_CONFIG_KEYS = new Set(["enabled", "keywords", "applyToSubagents"])

/** Upper bound on remembered arming ids per live session; a live session rarely exceeds it. */
const ARMED_MESSAGES_LIMIT = 1024

/** One arming ledger per live session object; the entry disappears with the session. */
const armedMessagesBySession = new WeakMap()

function messageIds(messages) {
  const ids = []
  for (const message of messages) {
    const id = message?.id
    if (typeof id === "string" && id.length > 0) ids.push(id)
  }
  return ids
}

function alreadyArmed(session, ids) {
  if (session === undefined || session === null || ids.length === 0) return false
  const armed = armedMessagesBySession.get(session)
  if (armed === undefined) return false
  return ids.some((id) => armed.has(id))
}

function armMessages(session, ids) {
  if (session === undefined || session === null || ids.length === 0) return
  let armed = armedMessagesBySession.get(session)
  if (armed === undefined) {
    armed = new Set()
    armedMessagesBySession.set(session, armed)
  }
  if (armed.size > ARMED_MESSAGES_LIMIT) armed.clear()
  for (const id of ids) armed.add(id)
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
  return { enabled, applyToSubagents, keywords, pattern: buildKeywordPattern(keywords) }
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

  ctx.skills.register(loadUltraworkSkill())

  ctx.on(
    "agent/pre-step",
    async (payload, next) => {
      const decision = await next()
      if (decision.kind !== "enter") return decision
      if (payload.signal?.aborted === true) return decision
      try {
        if (!options.applyToSubagents && isChildAgent(payload.agent)) return decision
        if (decision.messages.some(isUltraworkMessage)) return decision
        const matched = findKeywordMessages(decision.messages, options.pattern, options.keywords)
        if (matched.length === 0) return decision
        const session = payload.agent?.session
        const ids = messageIds(matched)
        if (alreadyArmed(session, ids)) return decision
        const injected = createUltraworkMessage({
          id: randomUUID(),
          pointer: buildUltraworkPointer({ skillName: ULTRAWORK_SKILL_NAME }),
        })
        armMessages(session, ids)
        return { ...decision, messages: [...decision.messages, injected] }
      } catch (error) {
        ctx.logger?.warn?.("omo-ultrawork: skill pointer injection skipped: %o", error)
        return decision
      }
    },
    { prepend: true },
  )
}
