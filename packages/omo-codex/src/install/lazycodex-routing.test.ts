/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import process from "node:process"
import * as p from "@clack/prompts"
import { resolveInstallArgs } from "../../../omo-opencode/src/cli/install-command-options"
import { runCliInstaller } from "../../../omo-opencode/src/cli/cli-installer"
import * as codexInstaller from "../../../omo-opencode/src/cli/install-codex"
import { validateNonTuiArgs } from "../../../omo-opencode/src/cli/install-validators"
import { install } from "../../../omo-opencode/src/cli/install"
import { promptInstallPlatform } from "../../../omo-opencode/src/cli/tui-install-prompts"

describe("lazycodex install routing", () => {
  const originalInvocationName = process.env.OMO_INVOCATION_NAME
  const originalError = console.error

  afterEach(() => {
    if (originalInvocationName === undefined) delete process.env.OMO_INVOCATION_NAME
    else process.env.OMO_INVOCATION_NAME = originalInvocationName
    console.error = originalError
    mock.restore()
  })

  test.each(["lazycodex", "lazycodex-ai"])("defaults %s to the retained Codex route", (invocationName) => {
    process.env.OMO_INVOCATION_NAME = invocationName

    const args = resolveInstallArgs({ tui: false })

    expect(args.platform).toBe("codex")
    expect(args.codexAutonomous).toBeUndefined()
    expect(validateNonTuiArgs(args)).toEqual({ valid: true, errors: [] })
  })

  test("preserves the default autonomous Codex permission selection", async () => {
    process.env.OMO_INVOCATION_NAME = "lazycodex"
    const install = spyOn(codexInstaller, "runCodexInstaller").mockResolvedValue({
      marketplaceName: "sisyphuslabs",
      installed: [],
      configPath: "/tmp/config.toml",
      codexHome: "/tmp/codex",
      gitBashPath: null,
      projectCleanup: {
        projectRoot: null,
        configPath: null,
        changed: false,
        removedKeys: [],
        configs: [],
        artifacts: [],
      },
    })

    const args = resolveInstallArgs({ tui: false })
    await expect(runCliInstaller(args)).resolves.toBe(0)
    expect(install).toHaveBeenCalledWith({ autonomousPermissions: true })
  })

  test("keeps explicit retired platforms on the rejecting install boundary", async () => {
    process.env.OMO_INVOCATION_NAME = "lazycodex"
    console.error = mock(() => {})

    const args = resolveInstallArgs({ tui: false, platform: "both" })

    expect(args.platform).toBe("both")
    expect(validateNonTuiArgs(args).valid).toBe(false)
    await expect(install(args)).resolves.toBe(1)
  })

  test.each(["oh-my-opencode", undefined])("generic invocation %p selects Codex interactively", async (_name) => {
    const select = spyOn(p, "select").mockResolvedValue("codex")
    const selectCalls = select as unknown as {
      mock: { calls: readonly (readonly [{ initialValue: unknown; options: readonly [{ value: unknown }] }])[] }
    }

    await expect(promptInstallPlatform()).resolves.toBe("codex")
    expect(selectCalls.mock.calls[0]?.[0].initialValue).toBe("codex")
    expect(selectCalls.mock.calls[0]?.[0].options.map((option) => option.value)).toEqual(["codex"])
  })
})
