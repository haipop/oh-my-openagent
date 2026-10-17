import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  buildRulesPointer,
  globToRegExp,
  isRulesMessage,
  loadRules,
  parseFrontmatter,
  pathTokens,
  readRuleFile,
  selectRules,
} from "../lib/rules.js"

const tempRoots: string[] = []

afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true })
})

function createRuleRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "omo-dsh-rules-"))
  tempRoots.push(root)
  const directory = join(root, ".omo", "rules")
  mkdirSync(directory, { recursive: true })
  for (const [name, content] of Object.entries(files)) writeFileSync(join(directory, name), content)
  return root
}

describe("rule frontmatter", () => {
  test("#given globs and description #when parsed #then both fields are read", () => {
    const parsed = parseFrontmatter('description: Test rules\nglobs:\n  - "**/*.test.ts"\n  - "src/**/*.ts"\n')
    expect(parsed.description).toBe("Test rules")
    expect(parsed.globs).toEqual(["**/*.test.ts", "src/**/*.ts"])
    expect(parsed.alwaysApply).toBe(false)
  })

  test("#given an inline glob list #when parsed #then every entry is kept", () => {
    expect(parseFrontmatter('globs: ["*.py", "src/*.rs"]\n').globs).toEqual(["*.py", "src/*.rs"])
  })

  test("#given alwaysApply true #when parsed #then the flag is set", () => {
    expect(parseFrontmatter("alwaysApply: true\n").alwaysApply).toBe(true)
  })
})

describe("glob matching", () => {
  test("#given a double-star glob #when matched #then it crosses directories", () => {
    const pattern = globToRegExp("**/*.test.ts")
    expect(pattern.test("packages/a/b.test.ts")).toBe(true)
    expect(pattern.test("b.test.ts")).toBe(true)
    expect(pattern.test("packages/a/b.ts")).toBe(false)
  })

  test("#given a single-star glob #when matched #then it stays inside one segment", () => {
    const pattern = globToRegExp("src/*.ts")
    expect(pattern.test("src/a.ts")).toBe(true)
    expect(pattern.test("src/nested/a.ts")).toBe(false)
  })

  test("#given a regex-special directory name #when matched #then it is escaped", () => {
    expect(globToRegExp("src/(a)+/*.ts").test("src/(a)+/b.ts")).toBe(true)
  })
})

describe("rule selection", () => {
  const rules = Object.freeze([
    Object.freeze({ name: "always", description: "", globs: Object.freeze([]), alwaysApply: true, body: "always body" }),
    Object.freeze({ name: "tests", description: "", globs: Object.freeze(["**/*.test.ts"]), alwaysApply: false, body: "test body" }),
    Object.freeze({ name: "python", description: "", globs: Object.freeze(["**/*.py"]), alwaysApply: false, body: "py body" }),
  ])

  test("#given a prompt that names a matching path #when selected #then the glob rule joins the always rules", () => {
    const selected = selectRules(rules, "fix packages/x/src/a.test.ts please")
    expect(selected.map((rule) => rule.name)).toEqual(["always", "tests"])
  })

  test("#given a prompt with no matching path #when selected #then only always rules apply", () => {
    expect(selectRules(rules, "fix the parser").map((rule) => rule.name)).toEqual(["always"])
  })

  test("#given prompt text #when tokenized #then path-like tokens are extracted", () => {
    expect(pathTokens("see ./src/main.ts and config/app.py")).toContain("src/main.ts")
  })
})

describe("rule loading", () => {
  test("#given a rule root #when loaded #then markdown rules keep their body and skip other files", () => {
    const cwd = createRuleRoot({
      "alpha.md": "---\ndescription: alpha rule\n---\n\n# Alpha\nBe careful.\n",
      "ignored.txt": "not a rule",
    })
    const rules = loadRules({ cwd, roots: [".omo/rules"], maxRules: 8 })
    expect(rules).toHaveLength(1)
    expect(rules[0]?.name).toBe("alpha.md")
    expect(rules[0]?.description).toBe("alpha rule")
    expect(rules[0]?.body).toBe("# Alpha\nBe careful.")
  })

  test("#given more rules than the cap #when loaded #then the list is bounded", () => {
    const cwd = createRuleRoot({
      "a.md": "A body",
      "b.md": "B body",
      "c.md": "C body",
    })
    expect(loadRules({ cwd, roots: [".omo/rules"], maxRules: 2 })).toHaveLength(2)
  })

  test("#given a missing root #when loaded #then it is skipped without throwing", () => {
    const cwd = createRuleRoot({})
    expect(loadRules({ cwd, roots: ["/nonexistent/omo/rules"], maxRules: 8 })).toEqual([])
  })

  test("#given an unreadable rule file #when read #then the reader returns undefined", () => {
    expect(readRuleFile("/nonexistent/omo/rules/x.md")).toBeUndefined()
  })
})

describe("rules message", () => {
  const rules = Object.freeze([
    Object.freeze({ name: "a.md", description: "alpha", globs: Object.freeze([]), alwaysApply: true, body: "body a" }),
    Object.freeze({ name: "b.md", description: "", globs: Object.freeze([]), alwaysApply: true, body: "body b" }),
  ])

  test("#given selected rules #when rendered #then the marker, names, and bodies are present", () => {
    const text = buildRulesPointer(rules, 4000)
    expect(text.startsWith("<omo-rules>")).toBe(true)
    expect(text.endsWith("</omo-rules>")).toBe(true)
    expect(text).toContain("a.md")
    expect(text).toContain("body a")
    expect(text).toContain("body b")
  })

  test("#given a tiny budget #when rendered #then the last rule is truncated with a note", () => {
    const text = buildRulesPointer(rules, 120)
    expect(text).toContain("truncated")
  })

  test("#given an injected message #when checked #then its source kind is recognized", () => {
    expect(isRulesMessage({ source: { kind: "omo-rules" } })).toBe(true)
    expect(isRulesMessage({ source: { kind: "user" } })).toBe(false)
  })
})
