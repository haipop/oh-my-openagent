import { describe, expect, test } from "bun:test"

import {
  buildCommentWarning,
  commentTextOf,
  extractAddedText,
  findSlopComments,
  isCheckedTool,
} from "../lib/comment-checker.js"

describe("comment extraction", () => {
  test("#given a line comment #when read #then the comment text is returned", () => {
    expect(commentTextOf("  // increment the counter")).toBe("increment the counter")
  })

  test("#given a trailing comment #when read #then only the comment text is returned", () => {
    expect(commentTextOf("count += 1 // bump it")).toBe("bump it")
  })

  test("#given a python comment #when read #then the hash marker is stripped", () => {
    expect(commentTextOf("# loop through rows")).toBe("loop through rows")
  })

  test("#given code with no comment #when read #then undefined is returned", () => {
    expect(commentTextOf("const value = compute()")).toBeUndefined()
  })
})

describe("slop detection", () => {
  test("#given a comment that restates the next line #when checked #then it is flagged", () => {
    const findings = findSlopComments("// increment the counter\ncounter += 1\n")
    expect(findings).toHaveLength(1)
    expect(findings[0]?.pattern).toBe("restates-obvious")
    expect(findings[0]?.line).toBe(1)
  })

  test("#given a comment that explains why #when checked #then it is not flagged", () => {
    expect(findSlopComments("// The API rejects a 0 id, so clamp before calling it.\n")).toEqual([])
  })

  test("#given filler wording #when checked #then it is flagged", () => {
    expect(findSlopComments("// This simply handles the obvious case\n")[0]?.pattern).toBe("filler")
  })

  test("#given a banner divider #when checked #then it is flagged", () => {
    expect(findSlopComments("// ==============\n")[0]?.pattern).toBe("banner")
  })

  test("#given commented-out code #when checked #then it is flagged", () => {
    expect(findSlopComments("// const x = compute()\n")[0]?.pattern).toBe("commented-code")
  })

  test("#given an em dash inside a comment #when checked #then it is flagged", () => {
    expect(findSlopComments("// fallback — retry once\n")[0]?.pattern).toBe("em-dash")
  })

  test("#given many findings #when checked #then the list stays bounded", () => {
    const text = Array.from({ length: 20 }, () => "// increment the counter").join("\n")
    expect(findSlopComments(text).length).toBeLessThanOrEqual(6)
  })
})

describe("added text extraction", () => {
  test("#given a write call #when extracted #then the content is used", () => {
    expect(extractAddedText("write", { file_path: "a.ts", content: "// note that x" })).toEqual({ path: "a.ts", text: "// note that x" })
  })

  test("#given an edit call #when extracted #then the new string is used", () => {
    expect(extractAddedText("edit", { file_path: "a.py", old_string: "x", new_string: "# loop" })).toEqual({ path: "a.py", text: "# loop" })
  })

  test("#given a non-code file #when extracted #then nothing is checked", () => {
    expect(extractAddedText("write", { file_path: "notes.md", content: "# title" })).toBeUndefined()
  })

  test("#given an unrelated tool #when extracted #then nothing is checked", () => {
    expect(extractAddedText("bash", { command: "ls" })).toBeUndefined()
  })
})

describe("warning message", () => {
  test("#given findings #when rendered #then path and finding lines are present", () => {
    const text = buildCommentWarning({ path: "src/a.ts", findings: [{ line: 3, comment: "loop over rows", pattern: "restates-obvious" }] })
    expect(text.startsWith("<comment-checker>")).toBe(true)
    expect(text).toContain("src/a.ts")
    expect(text).toContain("line 3")
    expect(text.endsWith("</comment-checker>")).toBe(true)
  })

  test("#given configured tools #when checked #then membership decides", () => {
    expect(isCheckedTool("write", ["write", "edit"])).toBe(true)
    expect(isCheckedTool("bash", ["write"])).toBe(false)
  })
})
