import { describe, expect, test } from "bun:test"
import { validateNonTuiArgs } from "./install-validators"

describe("validateNonTuiArgs", () => {
  test("accepts the retained Codex-only noninteractive installer", () => {
    expect(validateNonTuiArgs({ tui: false, platform: "codex" })).toEqual({ valid: true, errors: [] })
  })

  test("preserves explicit autonomous opt-out as a Codex option", () => {
    expect(validateNonTuiArgs({ tui: false, platform: "codex", codexAutonomous: false })).toEqual({
      valid: true,
      errors: [],
    })
  })

  test("rejects retired platform boundaries and OpenCode provider flags", () => {
    const result = validateNonTuiArgs({
      tui: false,
      platform: "opencode",
      claude: "yes",
      vercelAiGateway: "yes",
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Only --platform=codex is active")
    expect(result.errors).toContain("--claude is retired with the OpenCode V1 installer")
    expect(result.errors).toContain("--vercel-ai-gateway is retired with the OpenCode V1 installer")
  })
})
