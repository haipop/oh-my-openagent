import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"

const AGENT_MARKDOWN_PATH = join(import.meta.dir, "../../.opencode/agents/sisyphus.md")

describe("packaged Sisyphus agent markdown", () => {
  test("declares a primary agent without unavailable V1 capabilities", () => {
    const markdown = readFileSync(AGENT_MARKDOWN_PATH, "utf8")
    const frontmatter = markdown.slice(0, markdown.indexOf("\n---\n", 4))

    expect(frontmatter).toContain("mode: primary")
    expect(frontmatter).toContain("description:")
    expect(markdown).toContain("omo_status")
    expect(markdown).toContain("ulw")
    expect(markdown).not.toContain("call_omo_agent")
    expect(markdown).not.toContain("task(")
    expect(markdown).not.toContain("team_")
    expect(markdown).not.toContain("background_")
  })
})
