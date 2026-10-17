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
import { loadLibrarySkills } from "./lib/library.js"
import { buildModes, findModeMatch } from "./lib/modes.js"
import { loadMergedConfig } from "./lib/config-file.js"
import {
  buildCommentWarning,
  COMMENTS_SOURCE_KIND,
  DEFAULT_MAX_WARNINGS,
  DEFAULT_TOOLS,
  extractAddedText,
  findSlopComments,
  isCheckedTool,
} from "./lib/comment-checker.js"
import { createModeMessage, createSourcedMessage, isModeMessage } from "./lib/pointer.js"
import {
  buildRulesPointer,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_RULES,
  DEFAULT_RULE_ROOTS,
  isRulesMessage,
  loadRules,
  RULES_SOURCE_KIND,
  selectRules,
} from "./lib/rules.js"
import { loadHyperplanSkill, loadUltraworkSkill } from "./lib/skill.js"

/** Cordis plugin name; matches the `omo-ultrawork` row in `cordis.patch.yml`. */
export const name = "omo-ultrawork"

/**
 * The bundle needs the skill registry and the session working directory: the
 * former registers the directives, the latter locates `.omo/rules`. A profile
 * without them leaves the plugin inactive instead of throwing.
 */
export const inject = ["skills", "workingDirectory"]

const KNOWN_CONFIG_KEYS = new Set(["enabled", "keywords", "applyToSubagents", "modes", "skills", "rules", "commentChecker"])
const KNOWN_MODE_KEYS = new Set(["ultrawork", "team", "hyperplan", "hyperplanUltrawork"])
const KNOWN_SKILL_KEYS = new Set(["library"])
const KNOWN_RULE_KEYS = new Set(["enabled", "roots", "maxRules", "maxBytes"])
const KNOWN_COMMENT_KEYS = new Set(["enabled", "tools", "maxWarnings"])

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

function resolveSkills(raw) {
  const skills = { library: true }
  if (raw === undefined) return skills
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("omo-ultrawork: config.skills must be an object")
  }
  for (const key of Object.keys(raw)) {
    if (!KNOWN_SKILL_KEYS.has(key)) {
      throw new TypeError(`omo-ultrawork: unknown config.skills key "${key}"`)
    }
    if (typeof raw[key] !== "boolean") {
      throw new TypeError(`omo-ultrawork: config.skills.${key} must be a boolean`)
    }
    skills[key] = raw[key]
  }
  return skills
}

function resolveRules(raw) {
  const rules = { enabled: true, roots: DEFAULT_RULE_ROOTS, maxRules: DEFAULT_MAX_RULES, maxBytes: DEFAULT_MAX_BYTES }
  if (raw === undefined) return rules
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("omo-ultrawork: config.rules must be an object")
  }
  for (const key of Object.keys(raw)) {
    if (!KNOWN_RULE_KEYS.has(key)) throw new TypeError(`omo-ultrawork: unknown config.rules key "${key}"`)
  }
  if (raw.enabled !== undefined) {
    if (typeof raw.enabled !== "boolean") throw new TypeError("omo-ultrawork: config.rules.enabled must be a boolean")
    rules.enabled = raw.enabled
  }
  if (raw.roots !== undefined) {
    if (!Array.isArray(raw.roots) || raw.roots.length === 0 || raw.roots.some((root) => typeof root !== "string" || root.length === 0)) {
      throw new TypeError("omo-ultrawork: config.rules.roots must be a non-empty array of strings")
    }
    rules.roots = Object.freeze([...raw.roots])
  }
  if (raw.maxRules !== undefined) {
    if (!Number.isInteger(raw.maxRules) || raw.maxRules < 1) {
      throw new TypeError("omo-ultrawork: config.rules.maxRules must be a positive integer")
    }
    rules.maxRules = raw.maxRules
  }
  if (raw.maxBytes !== undefined) {
    if (!Number.isInteger(raw.maxBytes) || raw.maxBytes < 256) {
      throw new TypeError("omo-ultrawork: config.rules.maxBytes must be an integer >= 256")
    }
    rules.maxBytes = raw.maxBytes
  }
  return rules
}

function resolveCommentChecker(raw) {
  const checker = { enabled: true, tools: DEFAULT_TOOLS, maxWarnings: DEFAULT_MAX_WARNINGS }
  if (raw === undefined) return checker
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("omo-ultrawork: config.commentChecker must be an object")
  }
  for (const key of Object.keys(raw)) {
    if (!KNOWN_COMMENT_KEYS.has(key)) throw new TypeError(`omo-ultrawork: unknown config.commentChecker key "${key}"`)
  }
  if (raw.enabled !== undefined) {
    if (typeof raw.enabled !== "boolean") throw new TypeError("omo-ultrawork: config.commentChecker.enabled must be a boolean")
    checker.enabled = raw.enabled
  }
  if (raw.tools !== undefined) {
    if (!Array.isArray(raw.tools) || raw.tools.length === 0 || raw.tools.some((tool) => typeof tool !== "string" || tool.length === 0)) {
      throw new TypeError("omo-ultrawork: config.commentChecker.tools must be a non-empty array of tool names")
    }
    checker.tools = Object.freeze([...raw.tools])
  }
  if (raw.maxWarnings !== undefined) {
    if (!Number.isInteger(raw.maxWarnings) || raw.maxWarnings < 0) {
      throw new TypeError("omo-ultrawork: config.commentChecker.maxWarnings must be a non-negative integer")
    }
    checker.maxWarnings = raw.maxWarnings
  }
  return checker
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
    skills: resolveSkills(raw.skills),
    rules: resolveRules(raw.rules),
    commentChecker: resolveCommentChecker(raw.commentChecker),
  }
}

function registerSkills(ctx, enabledModes, skills) {
  if (enabledModes.ultrawork || enabledModes.hyperplanUltrawork) {
    ctx.skills.register(loadUltraworkSkill())
  }
  if (enabledModes.hyperplan || enabledModes.hyperplanUltrawork) {
    ctx.skills.register(loadHyperplanSkill())
  }
  if (skills.library) {
    for (const skill of loadLibrarySkills()) ctx.skills.register(skill)
  }
}

/** Per-session rule state: resolved rules, directory, and the names already injected. */
const rulesStateBySession = new WeakMap()

/** Per-session count of delivered comment-check warnings. */
const commentWarningsBySession = new WeakMap()

/** Per-session effective options: row config merged over the shared OmO config file. */
const sessionOptions = new WeakMap()

/**
 * Resolve the options that apply to this session.
 *
 * The row config is authoritative; the shared OmO config file contributes only
 * the keys the row leaves unset. A file that fails validation falls back to the
 * row config with a warning instead of breaking the session.
 */
async function effectiveOptions(ctx, agent, rowConfig, baseOptions) {
  const session = agent?.session
  if (session === undefined || session === null) return baseOptions
  const cached = sessionOptions.get(session)
  if (cached !== undefined) return cached
  let options = baseOptions
  const cwd = await resolveSessionDirectory(ctx, agent)
  if (cwd !== undefined) {
    try {
      options = resolveOptions(loadMergedConfig(cwd, rowConfig))
    } catch (error) {
      ctx.logger?.warn?.("omo-ultrawork: shared config ignored: %o", error)
      options = baseOptions
    }
  }
  sessionOptions.set(session, options)
  return options
}

async function resolveSessionDirectory(ctx, agent) {
  try {
    const workingDirectory = ctx.workingDirectory
    if (workingDirectory === undefined || typeof workingDirectory.ensure !== "function") return undefined
    const directory = await workingDirectory.ensure(agent)
    return typeof directory === "string" && directory.length > 0 ? directory : undefined
  } catch {
    return undefined
  }
}

function humanPromptText(messages) {
  return messages
    .filter((message) => message?.role === "user" && message?.source?.kind === "user")
    .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
}

/**
 * Inject the project rules that apply to this step, once per rule per session.
 *
 * Rules need the `workingDirectory` service to locate the session directory; a
 * profile without it keeps the other injections and skips this one.
 */
async function injectRules(ctx, options, payload, decision) {
  if (!options.rules.enabled) return decision
  if (decision.messages.some(isRulesMessage)) return decision
  const promptText = humanPromptText(decision.messages)
  if (promptText.length === 0) return decision
  const session = payload.agent?.session
  if (session === undefined || session === null) return decision
  let state = rulesStateBySession.get(session)
  if (state === undefined) {
    const cwd = await resolveSessionDirectory(ctx, payload.agent)
    if (cwd === undefined) return decision
    state = { cwd, rules: loadRules({ cwd, roots: options.rules.roots, maxRules: options.rules.maxRules }), injected: new Set() }
    rulesStateBySession.set(session, state)
  }
  const fresh = selectRules(state.rules, promptText).filter((rule) => !state.injected.has(rule.name))
  if (fresh.length === 0) return decision
  const injected = createSourcedMessage({
    id: randomUUID(),
    text: buildRulesPointer(fresh, options.rules.maxBytes),
    kind: RULES_SOURCE_KIND,
    summary: `project rules: ${fresh.map((rule) => rule.name).join(", ")}`,
  })
  for (const rule of fresh) state.injected.add(rule.name)
  return { ...decision, messages: [...decision.messages, injected] }
}

/**
 * Attach a bounded slop-comment warning to the result of a write or edit.
 *
 * The tool already ran, so the decision stays `accept`; the warning rides
 * along as an additional context the model sees on its next step.
 */
async function warnAboutComments(options, exec, result, downstream) {
  if (!options.commentChecker.enabled) return downstream
  if (result.isError === true) return downstream
  if (!isCheckedTool(exec.name, options.commentChecker.tools)) return downstream
  const added = extractAddedText(exec.name, exec.arguments)
  if (added === undefined) return downstream
  const findings = findSlopComments(added.text)
  if (findings.length === 0) return downstream
  const session = exec.agent?.session
  const delivered = session === undefined || session === null ? 0 : (commentWarningsBySession.get(session) ?? 0)
  if (delivered >= options.commentChecker.maxWarnings) return downstream
  if (session !== undefined && session !== null) commentWarningsBySession.set(session, delivered + 1)
  const warning = createSourcedMessage({
    id: randomUUID(),
    text: buildCommentWarning({ path: added.path, findings }),
    kind: COMMENTS_SOURCE_KIND,
    summary: `comment check: ${findings.length} finding(s) in ${added.path || "written file"}`,
  })
  if (downstream.kind === "block") {
    return { kind: "block", feedback: downstream.feedback, additionalContexts: [warning, ...(downstream.additionalContexts ?? [])] }
  }
  return { ...downstream, additionalContexts: [warning, ...(downstream.additionalContexts ?? [])] }
}

/**
 * Activate the bundle in the current Host composition.
 *
 * @param {object} ctx - Cordis context of the mounted plugin row.
 * @param {unknown} config - row config from `cordis.patch.yml`.
 */
export function apply(ctx, config) {
  const baseOptions = resolveOptions(config)
  if (!baseOptions.enabled) return
  const rowConfig = config ?? {}

  registerSkills(ctx, baseOptions.enabledModes, baseOptions.skills)

  ctx.on(
    "agent/pre-step",
    async (payload, next) => {
      const decision = await next()
      if (decision.kind !== "enter") return decision
      if (payload.signal?.aborted === true) return decision
      try {
        const options = await effectiveOptions(ctx, payload.agent, rowConfig, baseOptions)
        const withMode = injectMode(options, payload, decision)
        return await injectRules(ctx, options, payload, withMode)
      } catch (error) {
        ctx.logger?.warn?.("omo-ultrawork: context injection skipped: %o", error)
        return decision
      }
    },
    { prepend: true },
  )

  ctx.on("tools/post-execute", async (exec, result, next) => {
    const downstream = await next()
    try {
      const options = await effectiveOptions(ctx, exec.agent, rowConfig, baseOptions)
      return await warnAboutComments(options, exec, result, downstream)
    } catch (error) {
      ctx.logger?.warn?.("omo-ultrawork: comment check skipped: %o", error)
      return downstream
    }
  })
}

/** Inject the mode pointer for a human prompt, deduped per claimed message. */
function injectMode(options, payload, decision) {
  if (!options.applyToSubagents && isChildAgent(payload.agent)) return decision
  if (decision.messages.some(isModeMessage)) return decision
  const match = findModeMatch(decision.messages, buildModes(options))
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
}
