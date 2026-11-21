import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import * as p from "@clack/prompts"
import * as codexInstaller from "./install-codex"
import type { CodexInstallResult } from "./install-codex"
import * as prompts from "./tui-install-prompts"
import { runTuiInstaller } from "./tui-installer"
import type { InstallConfig } from "./types"

const codexResult: CodexInstallResult = {
  marketplaceName: "sisyphuslabs",
  installed: [],
  configPath: "/tmp/codex-config.toml",
  codexHome: "/tmp/codex-home",
  gitBashPath: null,
  projectCleanup: {
    projectRoot: null,
    configPath: null,
    changed: false,
    removedKeys: [],
    configs: [],
    artifacts: [],
  },
}

function codexConfig(codexAutonomous: boolean): InstallConfig {
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
    codexAutonomous,
  }
}

function mockClack() {
  const spinner = {
    start: mock(() => undefined),
    stop: mock((message: string) => message),
  }
  spyOn(p, "spinner").mockReturnValue(spinner)
  spyOn(p, "intro").mockImplementation(() => undefined)
  spyOn(p, "outro").mockImplementation(() => undefined)
  spyOn(p, "note").mockImplementation(() => undefined)
  spyOn(p, "confirm").mockResolvedValue(false)
  spyOn(p.log, "info").mockImplementation(() => undefined)
  spyOn(p.log, "warn").mockImplementation(() => undefined)
  spyOn(p.log, "success").mockImplementation(() => undefined)
  spyOn(p.log, "error").mockImplementation(() => undefined)
  return spinner
}

describe("runTuiInstaller retained Codex behavior", () => {
  const originalError = console.error
  const originalStdinTty = process.stdin.isTTY
  const originalStdoutTty = process.stdout.isTTY

  beforeEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true })
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true })
  })

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: originalStdinTty })
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: originalStdoutTty })
    console.error = originalError
    mock.restore()
  })

  test("installs only Codex and preserves the autonomous prompt choice", async () => {
    const spinner = mockClack()
    spyOn(prompts, "promptInstallPlatform").mockResolvedValue("codex")
    spyOn(prompts, "promptInstallConfig").mockResolvedValue(codexConfig(false))
    spyOn(codexInstaller, "detectCodexInstallation").mockResolvedValue({
      found: true,
      source: "cli",
      path: "/usr/local/bin/codex",
    })
    const install = spyOn(codexInstaller, "runCodexInstaller").mockResolvedValue(codexResult)

    await expect(runTuiInstaller({ tui: true, platform: "codex" })).resolves.toBe(0)

    expect(install).toHaveBeenCalledWith({ autonomousPermissions: false })
    expect(spinner.start).toHaveBeenCalledWith("Installing Codex harness adapter")
  })

  test("fails closed when Codex installation fails", async () => {
    mockClack()
    spyOn(prompts, "promptInstallPlatform").mockResolvedValue("codex")
    spyOn(prompts, "promptInstallConfig").mockResolvedValue(codexConfig(true))
    spyOn(codexInstaller, "detectCodexInstallation").mockResolvedValue({
      found: true,
      source: "cli",
      path: "/usr/local/bin/codex",
    })
    spyOn(codexInstaller, "runCodexInstaller").mockRejectedValue(new Error("codex failed"))

    await expect(runTuiInstaller({ tui: true, platform: "codex" })).resolves.toBe(1)
  })

  test("stops without installation when platform selection is cancelled", async () => {
    const install = spyOn(codexInstaller, "runCodexInstaller").mockResolvedValue(codexResult)
    spyOn(prompts, "promptInstallPlatform").mockResolvedValue(Symbol("cancel"))

    await expect(runTuiInstaller({ tui: true, platform: "codex" })).resolves.toBe(1)
    expect(install).not.toHaveBeenCalled()
  })

  test("requires a TTY for the interactive installer", async () => {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false })
    const error = mock(() => {})
    console.error = error

    await expect(runTuiInstaller({ tui: true, platform: "codex" })).resolves.toBe(1)
    expect(error).toHaveBeenCalledWith(
      "Error: Interactive installer requires a TTY. Use --no-tui for noninteractive Codex setup.",
    )
  })
})
