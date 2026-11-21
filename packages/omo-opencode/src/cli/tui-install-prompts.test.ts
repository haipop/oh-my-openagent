import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import * as p from "@clack/prompts"
import * as prompts from "./tui-install-prompts"
import type { DetectedConfig } from "./types"

function createDetectedConfig(): DetectedConfig {
  return {
    isInstalled: true,
    installedVersion: "9.9.9",
    hasClaude: true,
    isMax20: true,
    hasOpenAI: true,
    hasGemini: true,
    hasCopilot: true,
    hasCodex: true,
    hasOpencodeZen: true,
    hasZaiCodingPlan: true,
    hasKimiForCoding: true,
    hasOpencodeGo: true,
    hasBailianCodingPlan: true,
    hasMinimaxCnCodingPlan: true,
    hasMinimaxCodingPlan: true,
    hasVercelAiGateway: true,
  }
}

describe("promptInstallPlatform", () => {
  afterEach(() => mock.restore())

  test("offers only Codex and defaults the initial value to Codex", async () => {
    const select = spyOn(p, "select").mockResolvedValue("codex")

    await expect(prompts.promptInstallPlatform()).resolves.toBe("codex")

    const input = select.mock.calls[0]?.[0]
    expect(input.initialValue).toBe("codex")
    expect(input.options).toEqual([
      {
        value: "codex",
        label: "Codex",
        hint: "Install Codex harness adapter only",
      },
    ])
  })

  test("returns null when the prompt is cancelled", async () => {
    const cancel = Symbol("cancel")
    spyOn(p, "select").mockResolvedValue(cancel)

    await expect(prompts.promptInstallPlatform()).resolves.toBeNull()
  })
})

describe("promptInstallConfig", () => {
  afterEach(() => mock.restore())

  test("returns a Codex-only configuration and ignores V1 detection", async () => {
    const select = spyOn(p, "select").mockResolvedValue("no")

    await expect(prompts.promptInstallConfig(createDetectedConfig(), "codex")).resolves.toEqual({
      platform: "codex",
      hasOpenCode: false,
      hasClaude: false,
      isMax20: false,
      hasOpenAI: false,
      hasGemini: false,
      hasCopilot: false,
      hasCodex: true,
      hasNative: false,
      hasNativeDev: false,
      hasOpencodeZen: false,
      hasZaiCodingPlan: false,
      hasKimiForCoding: false,
      hasOpencodeGo: false,
      hasBailianCodingPlan: false,
      hasMinimaxCnCodingPlan: false,
      hasMinimaxCodingPlan: false,
      hasVercelAiGateway: false,
      codexAutonomous: true,
    })
    expect(select).not.toHaveBeenCalled()
  })

  test("preserves an explicit autonomous opt-out", async () => {
    await expect(prompts.promptInstallConfig(createDetectedConfig(), "codex", false)).resolves.toMatchObject({
      platform: "codex",
      codexAutonomous: false,
    })
  })

  test.each(["opencode", "both", "native", "native-dev"] as const)("returns null for retired %s", async (platform) => {
    await expect(prompts.promptInstallConfig(createDetectedConfig(), platform)).resolves.toBeNull()
  })
})
