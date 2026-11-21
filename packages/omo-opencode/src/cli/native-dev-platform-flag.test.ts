import { describe, expect, test } from "bun:test"
import { availableInstallPlatforms } from "./native-dev-platform-flag"

describe("availableInstallPlatforms", () => {
  test("exposes only the active Codex installer", () => {
    expect(availableInstallPlatforms({})).toEqual(["codex"])
  })

  test("ignores retired native and native-dev feature flags", () => {
    const env = {
      OMO_ENABLE_NATIVE_DEV_PLATFORM: "1",
      OMO_ENABLE_SENPI_PLATFORM: "1",
    } satisfies NodeJS.ProcessEnv

    expect(availableInstallPlatforms(env)).toEqual(["codex"])
  })
})
