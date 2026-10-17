/**
 * Ultrawork keyword detection for DeepSeek Harness sessions.
 *
 * Contract:
 * - only a human-authored prompt can arm the mode;
 * - `ulw` followed by a hyphen and a word character is a skill name (`ulw-plan`,
 *   `ulw-loop`), never an invocation;
 * - code spans are stripped, so a quoted pattern does not arm the mode;
 * - URLs, path-like segments, and identifier-like runs never arm the mode, so a
 *   link that happens to contain `ulw` stays inert;
 * - negated mentions ("do not use ultrawork", "不要用 ultrawork") do not arm the
 *   mode.
 *
 * @module @oh-my-opencode/omo-dsh/detect
 */

const FENCED_CODE_PATTERN = /```[\s\S]*?```/g
const INLINE_CODE_PATTERN = /`[^`\n]*`/g
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi

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

/**
 * Remove URLs from a prompt before keyword matching.
 *
 * A URL such as `https://example.com/ulw` names a path, not an invocation.
 *
 * @param {string} text - raw prompt text.
 * @returns {string} the text with URLs blanked out.
 */
export function stripUrls(text) {
  if (typeof text !== "string") return ""
  return text.replace(URL_PATTERN, " ")
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function keywordAlternation(keywords) {
  return keywords
    .map((keyword) => escapeRegExp(keyword.trim()))
    .filter((keyword) => keyword.length > 0)
    .join("|")
}

/**
 * Build the activation pattern for one keyword list.
 *
 * The leading lookbehind rejects URL, path, and identifier continuations, and
 * the trailing lookahead rejects identifier continuations. `ulw` keeps the
 * upstream `(?!-\w)` guard so skill names never trigger the mode.
 *
 * @param {readonly string[]} keywords - activation keywords.
 * @returns {RegExp} case-insensitive alternation with boundary guards.
 */
export function buildKeywordPattern(keywords) {
  const parts = keywords.map((keyword) => {
    const normalized = keyword.trim()
    return normalized.toLowerCase() === "ulw" ? "ulw(?!-\\w)" : escapeRegExp(normalized)
  })
  return new RegExp(`(?<![\\w/.\\-])(?:${parts.join("|")})(?![\\w/\\-])`, "i")
}

/**
 * Build the negation pattern for one keyword list.
 *
 * @param {readonly string[]} keywords - activation keywords.
 * @returns {RegExp} global, case-insensitive negation match.
 */
export function buildNegationPattern(keywords = DEFAULT_KEYWORDS) {
  const alternation = keywordAlternation(keywords)
  return new RegExp(
    `(?:\\b(?:do\\s+not|don['’]?t|dont|never|no|not|without|avoid|disable|turn\\s+off|stop|skip)\\s+(?:use\\s+|using\\s+)?(?:${alternation})\\b)|(?:(?:不要|别|禁止|不用|无需|不可|勿|禁用|关掉|关闭|停用|忽略)\\s*(?:使用|用)?\\s*(?:${alternation}))`,
    "gi",
  )
}

/**
 * Blank out negated mentions before matching.
 *
 * @param {string} text - raw prompt text.
 * @param {readonly string[]} [keywords] - activation keywords.
 * @returns {string} the text with negated mentions blanked out.
 */
export function maskNegatedInvocations(text, keywords = DEFAULT_KEYWORDS) {
  if (typeof text !== "string") return ""
  return text.replace(buildNegationPattern(keywords), " ")
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
 * Whether a prompt text invokes the mode after the stripping and negation passes.
 *
 * @param {string} text - raw prompt text.
 * @param {RegExp} pattern - activation pattern from {@link buildKeywordPattern}.
 * @param {readonly string[]} [keywords] - activation keywords for negation masking.
 * @returns {boolean} true when a live keyword survives every guard.
 */
export function hasKeyword(text, pattern, keywords = DEFAULT_KEYWORDS) {
  const scrubbed = maskNegatedInvocations(stripUrls(stripCodeSpans(text)), keywords)
  return pattern.test(scrubbed)
}

/**
 * Find every human message that invokes the mode.
 *
 * @param {readonly unknown[]} messages - messages entering the step.
 * @param {RegExp} pattern - activation pattern from {@link buildKeywordPattern}.
 * @param {readonly string[]} [keywords] - activation keywords for negation masking.
 * @returns {readonly unknown[]} matching messages, in batch order.
 */
export function findKeywordMessages(messages, pattern, keywords = DEFAULT_KEYWORDS) {
  if (!Array.isArray(messages)) return []
  return messages.filter((message) => isUserAuthoredMessage(message) && hasKeyword(messageText(message), pattern, keywords))
}

/**
 * Find the first human message that invokes the mode.
 *
 * @param {readonly unknown[]} messages - messages entering the step.
 * @param {RegExp} pattern - activation pattern from {@link buildKeywordPattern}.
 * @param {readonly string[]} [keywords] - activation keywords for negation masking.
 * @returns {unknown | undefined} the first matching message, if any.
 */
export function findKeywordMessage(messages, pattern, keywords = DEFAULT_KEYWORDS) {
  return findKeywordMessages(messages, pattern, keywords)[0]
}
