/**
 * OmO rule files injected as one sourced context message per session.
 *
 * OmO's `rules-injector` hook matches rule files to the file being edited and
 * pushes only the matching rule into that step. DeepSeek Harness exposes no
 * per-file hook to a zero-dependency bundle, so this port uses the two seams it
 * does expose: it reads `.omo/rules/*.md` once per session through
 * `agent/pre-step`, and it selects rules by what the prompt mentions. A rule
 * with no `globs` (or `alwaysApply: true`) applies to the whole session; a
 * glob-scoped rule applies only when the prompt names a matching path.
 *
 * @module @oh-my-opencode/omo-dsh/rules
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { extname, join, resolve } from "node:path"

/** Source kind recorded on the injected rules message. */
export const RULES_SOURCE_KIND = "omo-rules"

/** Marker used both as the message marker and for duplicate detection. */
export const RULES_MARKER = "<omo-rules>"

/** Default rule roots relative to the session directory, plus the user home root. */
export const DEFAULT_RULE_ROOTS = [".omo/rules", "~/.omo/rules"]

/** Default rule count and injection byte budget. */
export const DEFAULT_MAX_RULES = 8
export const DEFAULT_MAX_BYTES = 16000

/** Path-ish token used to match glob-scoped rules against prompt text. */
const PATH_TOKEN = /(?:[\w.@+-]+\/)*[\w.@+-]+\.(?:[A-Za-z0-9]+)/gu

function expandRoot(root, cwd) {
  if (root === "~") return homedir()
  if (root.startsWith("~/")) return join(homedir(), root.slice(2))
  return resolve(cwd, root)
}

function splitFrontmatter(text) {
  if (!text.startsWith("---")) return { frontmatter: "", body: text }
  const end = text.indexOf("\n---", 3)
  if (end === -1) return { frontmatter: "", body: text }
  return {
    frontmatter: text.slice(3, end).replace(/^\r?\n/gu, ""),
    body: text.slice(end + 4).replace(/^\r?\n/gu, ""),
  }
}

/**
 * Parse the small frontmatter subset OmO rule files use: `description`, a
 * `globs` block or inline list, and `alwaysApply`. Unknown keys stay inert.
 *
 * @param {string} frontmatter - raw frontmatter text between the `---` fences.
 * @returns {{ description: string, globs: string[], alwaysApply: boolean }} parsed fields.
 */
export function parseFrontmatter(frontmatter) {
  const result = { description: "", globs: [], alwaysApply: false }
  if (frontmatter.trim().length === 0) return result
  const lines = frontmatter.split(/\r?\n/u)
  let listKey = undefined
  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const listItem = /^\s+-\s*(.+)$/u.exec(line)
    if (listItem !== null && listKey === "globs") {
      result.globs.push(unquote(listItem[1].trim()))
      continue
    }
    const field = /^([A-Za-z0-9_]+):\s*(.*)$/u.exec(line)
    if (field === null) continue
    const [, key, value] = field
    listKey = value.trim().length === 0 ? key : undefined
    if (key === "description") result.description = unquote(value.trim())
    if (key === "alwaysApply") result.alwaysApply = value.trim() === "true"
    if (key === "globs") {
      const inline = value.trim()
      if (inline.startsWith("[")) {
        result.globs.push(
          ...inline
            .replace(/^\[|\]$/gu, "")
            .split(",")
            .map((part) => unquote(part.trim()))
            .filter((part) => part.length > 0),
        )
      }
    }
  }
  return result
}

function unquote(value) {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && (trimmed.startsWith('"') || trimmed.startsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * Convert one glob to a regular expression. `**` crosses directories, `*` and
 * `?` stay inside one path segment.
 *
 * @param {string} glob - glob pattern from rule frontmatter.
 * @returns {RegExp} anchored matcher.
 */
export function globToRegExp(glob) {
  let out = ""
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    if (char === "*") {
      if (glob[index + 1] === "*") {
        out += ".*"
        index += 1
        if (glob[index + 1] === "/") index += 1
      } else {
        out += "[^/]*"
      }
    } else if (char === "?") {
      out += "[^/]"
    } else {
      out += char.replace(/[.+^${}()|[\]\\]/gu, "\\$&")
    }
  }
  return new RegExp(`^${out}$`, "u")
}

/**
 * Read one rule file.
 *
 * @param {string} file - absolute path.
 * @param {string} [name] - display name; defaults to the file basename.
 * @returns {{ name: string, description: string, globs: string[], alwaysApply: boolean, body: string } | undefined} parsed rule, or undefined when unreadable or empty.
 */
export function readRuleFile(file, name = file.split("/").pop() ?? file) {
  let text
  try {
    text = readFileSync(file, "utf8")
  } catch {
    return undefined
  }
  const { frontmatter, body } = splitFrontmatter(text)
  const parsed = parseFrontmatter(frontmatter)
  const trimmed = body.trim()
  if (trimmed.length === 0) return undefined
  return { name, description: parsed.description, globs: parsed.globs, alwaysApply: parsed.alwaysApply, body: trimmed }
}

/**
 * Load rules from every existing root, in root order then filename order.
 *
 * @param {{ cwd: string, roots?: string[], maxRules?: number }} input - session directory and rule roots.
 * @returns {ReadonlyArray<Readonly<{ name: string, description: string, globs: ReadonlyArray<string>, alwaysApply: boolean, body: string }>>} rules, bounded by `maxRules`.
 */
export function loadRules(input) {
  const maxRules = input.maxRules ?? DEFAULT_MAX_RULES
  const roots = input.roots ?? DEFAULT_RULE_ROOTS
  const rules = []
  const seen = new Set()
  for (const root of roots) {
    const directory = expandRoot(root, input.cwd)
    let entries
    try {
      if (!statSync(directory).isDirectory()) continue
      entries = readdirSync(directory)
    } catch {
      continue
    }
    for (const entry of entries.sort()) {
      if (extname(entry) !== ".md") continue
      const file = join(directory, entry)
      const rule = readRuleFile(file)
      if (rule === undefined || seen.has(rule.name)) continue
      seen.add(rule.name)
      rules.push(Object.freeze(rule))
      if (rules.length >= maxRules) return Object.freeze(rules)
    }
  }
  return Object.freeze(rules)
}

/**
 * Extract path-ish tokens from prompt text so glob-scoped rules can match.
 *
 * @param {string} text - human prompt text.
 * @returns {string[]} candidate relative paths.
 */
export function pathTokens(text) {
  const tokens = new Set()
  for (const match of text.matchAll(PATH_TOKEN)) {
    const token = match[0].replace(/^\.\//u, "")
    tokens.add(token)
    const parts = token.split("/")
    if (parts.length > 1) tokens.add(parts.slice(-2).join("/"))
  }
  return [...tokens]
}

/**
 * Select the rules that apply to this step.
 *
 * @param {ReadonlyArray<Readonly<{ name: string, description: string, globs: ReadonlyArray<string>, alwaysApply: boolean, body: string }>>} rules - loaded rules.
 * @param {string} promptText - joined human prompt text for this step.
 * @returns {ReadonlyArray<object>} rules to inject.
 */
export function selectRules(rules, promptText) {
  const tokens = pathTokens(promptText)
  return rules.filter((rule) => {
    if (rule.alwaysApply || rule.globs.length === 0) return true
    const patterns = rule.globs.map(globToRegExp)
    return tokens.some((token) => patterns.some((pattern) => pattern.test(token)))
  })
}

/**
 * Render the injected rules message body.
 *
 * @param {ReadonlyArray<Readonly<{ name: string, description: string, body: string }>>} rules - selected rules.
 * @param {number} [maxBytes] - body budget; the last rule is truncated with a note.
 * @returns {string} the message text wrapped in the rules marker.
 */
export function buildRulesPointer(rules, maxBytes = DEFAULT_MAX_BYTES) {
  const header = [
    RULES_MARKER,
    `**Project rules in effect** (${rules.length}): ${rules.map((rule) => rule.name).join(", ")}.`,
    "These rules are binding for this session. Follow them without being reminded, and treat a rule that conflicts with the user's request as a decision the user owns: raise it, do not silently ignore it.",
  ]
  const chunks = [...header]
  let used = header.join("\n").length
  for (const rule of rules) {
    const title = rule.description.length > 0 ? ` (${rule.description})` : ""
    const section = `\n## Rule: ${rule.name}${title}\n${rule.body}`
    if (used + section.length > maxBytes) {
      chunks.push(`\n## Rule: ${rule.name}${title}\n_[truncated: rule budget reached; read the file in .omo/rules for the rest]_`)
      break
    }
    chunks.push(section)
    used += section.length
  }
  chunks.push("</omo-rules>")
  return chunks.join("\n")
}

/**
 * Whether a message is the injected rules message.
 *
 * @param {{ source?: { kind?: string } }} message - user message.
 * @returns {boolean} true for the injected rule context.
 */
export function isRulesMessage(message) {
  return message?.source?.kind === RULES_SOURCE_KIND
}
