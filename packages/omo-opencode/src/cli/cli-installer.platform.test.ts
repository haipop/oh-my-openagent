import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { runCliInstaller } from "./cli-installer"
import * as codexInstaller from "./install-codex"
import type { CodexInstallResult } from "./install-codex"
import { TELEMETRY_INSTALL_DISCLOSURE_LINES } from "@oh-my-opencode/telemetry-core/install-disclosure"

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

describe("runCliInstaller retained Codex behavior", () => {
  const originalLog = console.log
  const log = mock(() => {})

  beforeEach(() => {
    log.mockClear()
    console.log = log
  })

  afterEach(() => {
    console.log = originalLog
    mock.restore()
  })

  test("installs Codex noninteractively with autonomous permissions by default", async () => {
    const install = spyOn(codexInstaller, "runCodexInstaller").mockResolvedValue(codexResult)

    await expect(runCliInstaller({ tui: false, platform: "codex" })).resolves.toBe(0)

    expect(install).toHaveBeenCalledWith({ autonomousPermissions: true })
    const output = log.mock.calls.flat().join("\n")
    expect(output).toContain("Installing Codex harness adapter")
    expect(output).toContain("/tmp/codex-config.toml")
    expect(output).toContain(TELEMETRY_INSTALL_DISCLOSURE_LINES[0])
  })

  test("preserves the explicit autonomous opt-out", async () => {
    const install = spyOn(codexInstaller, "runCodexInstaller").mockResolvedValue(codexResult)

    await expect(runCliInstaller({ tui: false, platform: "codex", codexAutonomous: false })).resolves.toBe(0)
    expect(install).toHaveBeenCalledWith({ autonomousPermissions: false })
  })

  test("returns failure and does not continue when the Codex installer fails", async () => {
    const install = spyOn(codexInstaller, "runCodexInstaller").mockRejectedValue(new Error("codex failed"))

    await expect(runCliInstaller({ tui: false, platform: "codex" })).resolves.toBe(1)
    expect(install).toHaveBeenCalledTimes(1)
    expect(log.mock.calls.flat().join("\n")).toContain("Codex install failed: codex failed")
  })

  test("rejects a direct retired platform call before dispatching Codex installation", async () => {
    const install = spyOn(codexInstaller, "runCodexInstaller").mockResolvedValue(codexResult)

    await expect(runCliInstaller({ tui: false, platform: "native" })).resolves.toBe(1)
    expect(install).not.toHaveBeenCalled()
  })
})
