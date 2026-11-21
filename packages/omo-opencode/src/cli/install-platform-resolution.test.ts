import { describe, expect, test } from "bun:test"
import { resolveCleanupPlatform, resolveInstallArgs } from "./cli-program"
import { availableInstallPlatforms } from "./native-dev-platform-flag"

describe("install platform resolution", () => {
  test("leaves generic omo invocation unresolved so interactive install defaults to Codex", () => {
    expect(resolveInstallArgs({ tui: true }, "omo").platform).toBeUndefined()
  })

  test("resolves explicit and lazycodex-default installs to Codex", () => {
    expect(resolveInstallArgs({ tui: true, platform: "codex" }, "omo").platform).toBe("codex")
    expect(resolveInstallArgs({ tui: true }, "lazycodex").platform).toBe("codex")
    expect(resolveInstallArgs({ tui: true }, "lazycodex-ai").platform).toBe("codex")
  })

  test("preserves retired boundary inputs for rejection by the install boundary", () => {
    for (const platform of ["opencode", "both", "native", "native-dev"] as const) {
      expect(resolveInstallArgs({ tui: true, platform }, "lazycodex").platform).toBe(platform)
    }
  })

  test("exposes only Codex as a Commander choice", () => {
    expect(availableInstallPlatforms()).toEqual(["codex"])
  })
})

describe("cleanup platform resolution", () => {
  test("defaults lazycodex cleanup to Codex platform", () => {
    expect(resolveCleanupPlatform({}, "lazycodex-ai")).toBe("codex")
  })
})
