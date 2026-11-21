// Builds facade-manifest.json from the TSDoc of src/facade.ts. Each tagged interface method becomes one entry:
// `Interface.method`, its parameters and return type as written, and its `@tier`, `@policy` and `@wire` tags.
import { ENGINE_METHODS, ENGINE_NOTIFICATIONS } from "@oh-my-opencode/senpi-desktop-protocol"
import ts from "@typescript/typescript6"

const FACADE_SOURCE = "packages/senpi-desktop-sdk/src/facade.ts"

export type FacadeTier = "read" | "exec"
export type FacadePolicy = "none" | "semantic" | "background" | "foreground"

export interface FacadeParam {
  readonly name: string
  readonly type: string
  readonly optional: boolean
}

export interface FacadeMethodEntry {
  readonly method: string
  readonly params: readonly FacadeParam[]
  readonly returns: string
  readonly tier: FacadeTier
  readonly policy: FacadePolicy
  readonly wire: readonly string[]
  readonly summary: string
}

export interface FacadeManifest {
  readonly generatedFrom: string
  readonly methods: readonly FacadeMethodEntry[]
}

const TIERS: ReadonlySet<string> = new Set(["read", "exec"])
const POLICIES: ReadonlySet<string> = new Set(["none", "semantic", "background", "foreground"])
const WIRE_NAMES: ReadonlySet<string> = new Set([...ENGINE_METHODS, ...ENGINE_NOTIFICATIONS])

const OPEN = new Set(["(", "[", "{", "<"])
const CLOSE = new Set([")", "]", "}", ">"])

/** Splits `text` at `separator` characters outside brackets; the `>` of `=>` is not a bracket. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ""
    if (char === ">" && text[index - 1] === "=") continue
    if (OPEN.has(char)) depth += 1
    else if (CLOSE.has(char)) depth -= 1
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, index))
      start = index + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}

/** The index just past the bracket that closes the one at `open`. */
function closingIndex(text: string, open: number): number {
  let depth = 0
  for (let index = open; index < text.length; index += 1) {
    const char = text[index] ?? ""
    if (char === ">" && text[index - 1] === "=") continue
    if (OPEN.has(char)) depth += 1
    else if (CLOSE.has(char)) {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  throw new Error(`unbalanced brackets from offset ${open}`)
}

interface DocTags {
  readonly summary: string
  readonly tags: ReadonlyMap<string, string>
}

function parseDoc(comment: string): DocTags {
  const lines = comment
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
  const summary: string[] = []
  const tags = new Map<string, string>()
  for (const line of lines) {
    const tag = /^@(\w+)\s*(.*)$/.exec(line)
    if (tag !== null) tags.set(tag[1] ?? "", (tag[2] ?? "").trim())
    else if (tags.size === 0 && line.length > 0) summary.push(line)
  }
  return { summary: summary.join(" "), tags }
}

function parseParam(text: string, where: string): FacadeParam {
  const match = /^(\w+)(\??)\s*:\s*([\s\S]+)$/.exec(text)
  if (match === null) throw new Error(`${where}: unsupported parameter ${JSON.stringify(text)}`)
  return { name: match[1] ?? "", optional: match[2] === "?", type: (match[3] ?? "").replace(/\s+/g, " ") }
}

function methodEntry(owner: string, member: string, doc: DocTags): FacadeMethodEntry {
  const head = /^(\w+)\s*\(/.exec(member)
  if (head === null) throw new Error(`${owner}: tagged member is not a method signature: ${member}`)
  const name = head[1] ?? ""
  const where = `${owner}.${name}`
  const paramsEnd = closingIndex(member, head[0].length - 1)
  const returns = /^\s*:\s*([\s\S]+)$/.exec(member.slice(paramsEnd))
  if (returns === null) throw new Error(`${where}: missing return type`)
  const tier = doc.tags.get("tier") ?? ""
  const policy = doc.tags.get("policy") ?? ""
  const wireTag = doc.tags.get("wire")
  if (!TIERS.has(tier)) throw new Error(`${where}: @tier must be read or exec, got ${JSON.stringify(tier)}`)
  if (!POLICIES.has(policy)) throw new Error(`${where}: @policy must be one of ${[...POLICIES].join(", ")}`)
  if (wireTag === undefined) throw new Error(`${where}: missing @wire (leave it empty for no engine call)`)
  const wire = splitTopLevel(wireTag, ",")
  for (const method of wire) {
    if (!WIRE_NAMES.has(method)) throw new Error(`${where}: @wire names unknown engine method ${method}`)
  }
  return {
    method: where,
    params: splitTopLevel(member.slice(head[0].length, paramsEnd - 1), ",").map((param) => parseParam(param, where)),
    returns: (returns[1] ?? "").replace(/\s+/g, " ").trim(),
    tier: tier as FacadeTier,
    policy: policy as FacadePolicy,
    wire,
    summary: doc.summary,
  }
}

/** Every tagged method of every exported interface in `source`, in source order. */
export function buildFacadeManifest(source: string): FacadeManifest {
  const file = ts.createSourceFile(FACADE_SOURCE, source, ts.ScriptTarget.Latest, true)
  const diagnostics: unknown = Reflect.get(file, "parseDiagnostics")
  if (!Array.isArray(diagnostics) || diagnostics.length !== 0) throw new SyntaxError("invalid facade source")
  const methods: FacadeMethodEntry[] = []
  for (const statement of file.statements) {
    if (!ts.isInterfaceDeclaration(statement)) continue
    if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue
    const owner = statement.name.text
    for (const member of statement.members) {
      let doc: DocTags | undefined
      const start = member.getFullStart()
      const comments = [
        ...(ts.getTrailingCommentRanges(source, start) ?? []),
        ...(ts.getLeadingCommentRanges(source, start) ?? []),
      ]
      for (const range of comments) {
        const comment = source.slice(range.pos, range.end)
        if (!comment.startsWith("/**")) throw new Error(`${owner}: only doc comments are supported`)
        doc = parseDoc(comment)
      }
      const text = member.getText(file).replace(/[;,]$/, "").trimEnd().replace(/\s+/g, " ")
      if (ts.isMethodSignature(member)) {
        if (doc === undefined) throw new Error(`${owner}: method without a doc comment: ${text}`)
        methods.push(methodEntry(owner, text, doc))
      } else if (!ts.isPropertySignature(member)) {
        throw new Error(`${owner}: unsupported member: ${text}`)
      } else if (doc?.tags.has("tier")) {
        throw new Error(`${owner}: @tier on a property: ${text}`)
      }
    }
  }
  if (methods.length === 0) throw new Error("no facade methods found")
  return { generatedFrom: FACADE_SOURCE, methods }
}

export function renderFacadeManifest(source: string): string {
  return `${JSON.stringify(buildFacadeManifest(source), null, "\t")}\n`
}
