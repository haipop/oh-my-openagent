import * as p from "@clack/prompts"
import type { DetectedConfig, InstallConfig, InstallPlatform } from "./types"

export async function promptInstallPlatform(
  initialValue: InstallPlatform = "codex",
): Promise<InstallPlatform | symbol | null> {
  const platform = await p.select({
    message: "Select installation platform",
    initialValue,
    options: [
      {
        value: "codex",
        label: "Codex",
        hint: "Install Codex harness adapter only",
      },
    ],
  })

  return p.isCancel(platform) ? null : platform
}

export async function promptInstallConfig(
  _detected: DetectedConfig,
  platform: InstallPlatform,
  codexAutonomousOverride?: boolean,
): Promise<InstallConfig | null> {
  if (platform !== "codex") return null

  return {
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
    codexAutonomous: codexAutonomousOverride ?? true,
  }
}
