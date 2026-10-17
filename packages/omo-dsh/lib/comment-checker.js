/**
 * AI-slop comment detection applied to `write` and `edit` calls.
 *
 * OmO ships a compiled comment checker binary behind a post-tool hook. A
 * zero-dependency bundle cannot run that binary, and DeepSeek Harness has no
 * external-checker seam, so this port does the part that matters at the
 * `tools/post-execute` waterfall: it reads the text the model just wrote and
 * attaches a bounded warning context when comments only restate the code.
 *
 * The checks are deliberately conservative. A false warning costs the model one
 * paragraph; a noisy checker trains it to ignore the warning entirely.
 *
 * @module @oh-my-opencode/omo-dsh/comment-checker
 */

/** Source kind recorded on the injected comment warning message. */
export const COMMENTS_SOURCE_KIND = "omo-comments"

/** Marker wrapped around the warning body. */
export const COMMENTS_MARKER = "<comment-checker>"

/** Default tools to inspect and the warning cap per session. */
export const DEFAULT_TOOLS = ["write", "edit"]
export const DEFAULT_MAX_WARNINGS = 3

/** Maximum findings reported in one warning. */
const MAX_FINDINGS = 6

/** File extensions whose comments are worth checking. */
const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rs", ".go", ".java", ".kt", ".swift", ".c", ".h", ".cc", ".cpp", ".hpp",
  ".rb", ".php", ".sh", ".bash", ".zsh", ".css", ".scss", ".vue", ".svelte", ".sql",
])

const SLOP_PATTERNS = [
  { id: "restates-obvious", test: (text) => /^(?:increment|decrement|loop (?:through|over)|iterate|set\s+\w+\s+to|return(?:\s+the)?|get\s+the|compute|calculate|create|initialize|init|call|invoke|check if|verify that|handle the|update the|add the|remove the|helper (?:to|for)|utility (?:to|for)|function (?:to|that)|this (?:function|method|variable|loop)|the following)\b/iu.test(text) },
  { id: "filler", test: (text) => /\b(?:simply|basically|obviously|clearly|just note that|note that|as you can see|of course)\b/iu.test(text) },
  { id: "banner", test: (text) => /^(?:[=\-*#_~]{4,}|[A-Z ]{6,}:?)$/u.test(text.trim()) },
  { id: "commented-code", test: (text) => /\b(?:function\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|if\s*\(|for\s*\(|return\s+\w+[;)]|=>|console\.\w+\(|print\()/u.test(text) },
  { id: "em-dash", test: (text) => /[—–]/u.test(text) },
]

/** Comment prefixes per language family: `//`, `#`, `--`, `;`, `%`, `/*`. */
const LINE_COMMENT = /^\s*(?:\/\/|\/\*+|\*|#|--|;|%)\s?(.*)$/u
const TRAILING_COMMENT = /(?:\/\/|#|--)\s*(.+)$/u

/**
 * Extract the comment text of a source line, if any.
 *
 * @param {string} line - one source line.
 * @returns {string | undefined} comment text without its marker.
 */
export function commentTextOf(line) {
  const own = LINE_COMMENT.exec(line)
  if (own !== null) return (own[1] ?? "").replace(/\*\/\s*$/u, "").trim()
  const trailing = TRAILING_COMMENT.exec(line)
  if (trailing !== null) return (trailing[1] ?? "").trim()
  return undefined
}

/**
 * Find slop comments in added source text.
 *
 * @param {string} text - added or written source text.
 * @returns {Array<{ line: number, comment: string, pattern: string }>} bounded findings.
 */
export function findSlopComments(text) {
  const findings = []
  const lines = text.split(/\r?\n/u)
  for (let index = 0; index < lines.length; index += 1) {
    const comment = commentTextOf(lines[index])
    if (comment === undefined || comment.length === 0) continue
    for (const pattern of SLOP_PATTERNS) {
      if (!pattern.test(comment)) continue
      findings.push({ line: index + 1, comment: comment.slice(0, 160), pattern: pattern.id })
      break
    }
    if (findings.length >= MAX_FINDINGS) break
  }
  return findings
}

/**
 * Extract the text a write or edit call added.
 *
 * @param {string} toolName - dispatched tool name.
 * @param {unknown} args - parsed tool arguments.
 * @returns {{ path: string, text: string } | undefined} added text, or undefined when this call writes no checked file.
 */
export function extractAddedText(toolName, args) {
  if (args === null || typeof args !== "object") return undefined
  const path = typeof args.file_path === "string" ? args.file_path : typeof args.path === "string" ? args.path : ""
  if (!CODE_EXTENSIONS.has(extensionOf(path))) return undefined
  if (toolName === "write" && typeof args.content === "string") return { path, text: args.content }
  if (toolName === "edit" && typeof args.new_string === "string") return { path, text: args.new_string }
  return undefined
}

function extensionOf(path) {
  const match = /\.[A-Za-z0-9]+$/u.exec(path)
  return match === null ? "" : match[0].toLowerCase()
}

/**
 * Render the warning context attached to the tool result.
 *
 * @param {{ path: string, findings: Array<{ line: number, comment: string, pattern: string }> }} input - path and findings.
 * @returns {string} warning text wrapped in the checker marker.
 */
export function buildCommentWarning(input) {
  const lines = [
    COMMENTS_MARKER,
    `**Comment check on \`${input.path || "written file"}\`** found ${input.findings.length} comment(s) that only restate the code:`,
    "",
    ...input.findings.map((finding) => `- line ${finding.line}: ${finding.pattern}: \`${finding.comment}\``),
    "",
    "Fix them in the next edit: delete comments that repeat what the line already says, keep comments only for why, a non-obvious constraint, or a warning. Do not disable or reword into different filler.",
    "</comment-checker>",
  ]
  return lines.join("\n")
}

/**
 * Whether a tool name participates in the check.
 *
 * @param {string} name - dispatched tool name.
 * @param {ReadonlyArray<string>} tools - configured tool names.
 * @returns {boolean} true when the call is checked.
 */
export function isCheckedTool(name, tools) {
  return tools.includes(name)
}
