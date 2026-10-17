/**
 * Ultrawork keyword detection for DeepSeek Harness sessions.
 *
 * Mirrors the OpenCode detector contract: the keyword must be a standalone word
 * (`ulw` with a `-suffix` is a skill name, not an invocation), matching is
 * case-insensitive, and code spans are removed before matching so a quoted
 * pattern in a prompt does not arm the mode.
 *
 * @module @oh-my-opencode/omo-dsh/detect
 */

const FENCED_CODE_PATTERN = /```[\s\S]*?```/g
const INLINE_CODE_PATTERN = /`[^`\n]*`/g

/** Default activation keywords, in the same spelling the other harnesses use. */
export const DEFAULT_KEYWORDS = Object.freeze(["ultrawork", "ulw"])

/**
 * Remove fenced and inline code from a prompt before keyword matching.
 *
 * @param {string} text - raw prompt text.
 * @returns {string} the text with code spans blanked out.
 */
export function stripCodeSpans(text) {
  if (typeof text !== "string") return ""
  return text.replace(FENCED_CODE_PATTERN, " ").replace(INLINE_CODE_PATTERN, " ")
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Build the activation pattern for one keyword list.
 *
 * `ulw` gets the upstream `(?!-\w)` guard so `ulw-plan`, `ulw-loop` and other
 * skill names never trigger the mode; every keyword is matched as a whole word.
 *
 * @param {readonly string[]} keywords - activation keywords.
 * @returns {RegExp} case-insensitive whole-word alternation.
 */
export function buildKeywordPattern(keywords) {
  const parts = keywords.map((keyword) => {
    const normalized = keyword.trim()
    return normalized.toLowerCase() === "ulw" ? "ulw(?!-\\w)" : escapeRegExp(normalized)
  })
  return new RegExp(`\\b(?:${parts.join("|")})\\b`, "i")
}

/**
 * Concatenate the text blocks of one message.
 *
 * @param {{ content?: readonly unknown[] } | undefined} message - session message.
 * @returns {string} joined text blocks, or an empty string.
 */
export function messageText(message) {
  const content = message?.content
  if (!Array.isArray(content)) return ""
  let text = ""
  for (const block of content) {
    if (block === null || typeof block !== "object") continue
    if (block.type !== "text" || typeof block.text !== "string") continue
    text = text.length === 0 ? block.text : `${text}\n${block.text}`
  }
  return text
}

/**
 * Whether a message was written by the human through the harness prompt surface.
 *
 * @param {{ role?: string, source?: { kind?: string } }} message - session message.
 * @returns {boolean} true for user-role, user-sourced messages.
 */
export function isUserAuthoredMessage(message) {
  return message?.role === "user" && message?.source?.kind === "user"
}

/**
 * Whether an agent is a delegated child session.
 *
 * The mode is a human-facing invocation; a subagent prompt that mentions the
 * keyword must not arm a hidden ultrawork directive inside the child.
 *
 * @param {{ session?: { header?: { origin?: string, parentSession?: string, delegationDepth?: number } } }} agent - live agent.
 * @returns {boolean} true for subagent sessions and forks of them.
 */
export function isChildAgent(agent) {
  const header = agent?.session?.header
  if (header === null || typeof header !== "object") return false
  if (header.origin === "subagent") return true
  if (header.parentSession !== undefined) return true
  return typeof header.delegationDepth === "number" && header.delegationDepth > 0
}

/**
 * Whether a prompt text invokes the mode.
 *
 * @param {string} text - raw prompt text.
 * @param {RegExp} pattern - activation pattern from {@link buildKeywordPattern}.
 * @returns {boolean} true when a keyword survives code-span stripping.
 */
export function hasKeyword(text, pattern) {
  return pattern.test(stripCodeSpans(text))
}

/**
 * Find the first human message that invokes the mode.
 *
 * @param {readonly unknown[]} messages - messages entering the step.
 * @param {RegExp} pattern - activation pattern from {@link buildKeywordPattern}.
 * @returns {unknown | undefined} the first matching message, if any.
 */
export function findKeywordMessage(messages, pattern) {
  if (!Array.isArray(messages)) return undefined
  for (const message of messages) {
    if (!isUserAuthoredMessage(message)) continue
    if (!hasKeyword(messageText(message), pattern)) continue
    return message
  }
  return undefined
}
