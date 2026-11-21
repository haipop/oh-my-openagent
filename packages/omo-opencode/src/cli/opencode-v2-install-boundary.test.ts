import { expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const RETIRED_PLATFORMS = [undefined, "opencode", "both", "native", "native-dev"] as const

test.skipIf(process.platform === "win32")(
  "refuses every retired install boundary before OpenCode, native, or Codex writes",
  () => {
    const sandbox = mkdtempSync(join(tmpdir(), "omo-install-boundary-"))
    try {
      const opencodeConfig = join(sandbox, "config", "opencode")
      const opencodeCache = join(sandbox, "cache", "opencode", "oh-my-openagent@fixture")
      const nativeCache = join(sandbox, "cache", "omo-native")
      const codexHome = join(sandbox, "codex")
      const bin = join(sandbox, "bin")
      for (const dir of [opencodeConfig, opencodeCache, nativeCache, codexHome, bin]) {
        mkdirSync(dir, { recursive: true })
      }

      const originalConfig = '{\n  // preserve comments and external plugins\n  "plugin": ["existing-plugin"]\n}\n'
      const configFile = join(opencodeConfig, "opencode.jsonc")
      writeFileSync(configFile, originalConfig)
      const opencodeSentinel = join(opencodeCache, "sentinel")
      writeFileSync(opencodeSentinel, "opencode untouched")
      const nativeSentinel = join(nativeCache, "sentinel")
      writeFileSync(nativeSentinel, "native untouched")
      const codexConfig = join(codexHome, "config.toml")
      writeFileSync(codexConfig, "# codex untouched\n")
      const host = join(bin, "opencode")
      writeFileSync(host, "#!/bin/sh\nprintf 'opencode v1.18.31\\n'\n")
      chmodSync(host, 0o755)

      const installPath = join(import.meta.dir, "install.ts")
      for (const platform of RETIRED_PLATFORMS) {
        const platformLiteral = platform === undefined ? "undefined" : JSON.stringify(platform)
        const result = Bun.spawnSync(
          [
            process.execPath,
            "-e",
            `import { install } from ${JSON.stringify(installPath)}; process.exit(await install({ tui: false, platform: ${platformLiteral} }))`,
          ],
          {
            cwd: sandbox,
            env: {
              HOME: sandbox,
              PATH: bin,
              XDG_CONFIG_HOME: join(sandbox, "config"),
              XDG_CACHE_HOME: join(sandbox, "cache"),
              XDG_DATA_HOME: join(sandbox, "data"),
              XDG_STATE_HOME: join(sandbox, "state"),
              CODEX_HOME: codexHome,
            },
            stderr: "pipe",
          },
        )

        expect(result.exitCode).toBe(1)
        const stderr = result.stderr.toString()
        expect(stderr).toContain(
          platform === undefined ? "Only Codex installation is active" : `${platform} installer is retired`,
        )
        expect(stderr).toContain(
          platform === undefined ? "Re-run with --platform=codex" : "Only --platform=codex is active",
        )
        expect(stderr).toContain("do not write configuration")
        expect(readdirSync(opencodeConfig)).toEqual(["opencode.jsonc"])
        expect(readFileSync(configFile, "utf8")).toBe(originalConfig)
        expect(readFileSync(opencodeSentinel, "utf8")).toBe("opencode untouched")
        expect(readFileSync(nativeSentinel, "utf8")).toBe("native untouched")
        expect(readFileSync(codexConfig, "utf8")).toBe("# codex untouched\n")
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  },
)
