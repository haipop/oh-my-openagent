import { describe, expect, it } from "bun:test"
import type { NpmDistTags } from "../../config-manager/npm-dist-tags"
import type { CodexDoctorSummary, SystemInfo } from "../framework/types"
import { gatherEditionDistTags, resolveLatestVersion } from "./latest-version"

function createSystemInfo(pluginVersion: string | null): SystemInfo {
  return {
    opencodeVersion: "2.3.2",
    opencodePath: "/usr/local/bin/opencode",
    pluginVersion,
    loadedVersion: pluginVersion,
    bunVersion: "1.2.0",
    configPath: "/tmp/opencode.json",
    configValid: true,
    isLocalDev: false,
  }
}

function createCodexSummary(packageVersion: string | null): CodexDoctorSummary {
  return {
    codexPath: "/usr/local/bin/codex",
    codexSource: "cli",
    codexAppId: null,
    marketplaceName: "sisyphuslabs",
    pluginName: "omo",
    pluginVersion: packageVersion,
    pluginVersionStamped: true,
    installerVersion: packageVersion,
    packageName: "lazycodex-ai",
    packageVersion,
    pluginRoot: "/tmp/omo",
    configPath: "/tmp/config.toml",
    config: {
      exists: true,
      marketplaceConfigured: true,
      pluginEnabled: true,
      pluginsFeatureEnabled: true,
      pluginHooksFeatureEnabled: true,
      companionPluginEnabled: false,
      companionLifecycleHookStateEvents: [],
    },
    linkedBins: ["omo"],
    agents: ["plan"],
  }
}

describe("gatherEditionDistTags", () => {
  it("does not query npm for the retired OpenCode V1 updater", async () => {
    const fetch = async () => {
      throw new Error("OpenCode dist-tags must not be fetched")
    }

    await expect(gatherEditionDistTags("opencode", fetch)).resolves.toBeNull()
  })

  it("fetches lazycodex-ai dist-tags for the retained Codex updater", async () => {
    const requested: string[] = []
    const tags: NpmDistTags = { latest: "4.19.4" }

    await expect(
      gatherEditionDistTags("codex", async (packageName) => {
        requested.push(packageName)
        return tags
      }),
    ).resolves.toEqual(tags)
    expect(requested).toEqual(["lazycodex-ai"])
  })
})

describe("resolveLatestVersion", () => {
  it("always returns null for the OpenCode target", () => {
    expect(
      resolveLatestVersion({
        target: "opencode",
        systemInfo: createSystemInfo("5.0.0-beta.51"),
        codex: undefined,
        distTags: { latest: "5.1.0" },
      }),
    ).toBeNull()
  })

  it("selects the matching Codex channel", () => {
    expect(
      resolveLatestVersion({
        target: "codex",
        systemInfo: createSystemInfo(null),
        codex: createCodexSummary("5.0.0-beta.51"),
        distTags: { latest: "4.19.4", beta: "5.0.0-beta.52" },
      }),
    ).toBe("5.0.0-beta.52")
  })
})
