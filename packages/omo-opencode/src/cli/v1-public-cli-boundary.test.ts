import { expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else files[path.slice(root.length)] = readFileSync(path, "utf8")
    }
  }
  walk(root)
  return files
}

test.skipIf(process.platform === "win32")("retired public V1 run and config migrate never spawn or write", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "omo-v1-cli-boundary-"))
  try {
    const env = {
      HOME: sandbox,
      PATH: join(sandbox, "bin"),
      XDG_CONFIG_HOME: join(sandbox, "config"),
      XDG_CACHE_HOME: join(sandbox, "cache"),
      XDG_DATA_HOME: join(sandbox, "data"),
      XDG_STATE_HOME: join(sandbox, "state"),
      CODEX_HOME: join(sandbox, "codex"),
    }
    for (const directory of [
      env.PATH,
      env.XDG_CONFIG_HOME,
      env.XDG_CACHE_HOME,
      env.XDG_DATA_HOME,
      env.XDG_STATE_HOME,
      env.CODEX_HOME,
    ]) {
      mkdirSync(directory, { recursive: true })
    }

    const host = join(env.PATH, "opencode")
    writeFileSync(host, `#!/bin/sh\nprintf spawned > ${JSON.stringify(join(sandbox, "host-spawned"))}\n`)
    chmodSync(host, 0o755)

    const opencodeConfigDir = join(env.XDG_CONFIG_HOME, "opencode")
    const omoDir = join(sandbox, ".omo")
    mkdirSync(opencodeConfigDir, { recursive: true })
    mkdirSync(omoDir, { recursive: true })
    const opencodeConfig = join(opencodeConfigDir, "opencode.jsonc")
    const omoConfig = join(omoDir, "omo.jsonc")
    writeFileSync(opencodeConfig, '// legacy V1 fixture\n{ "plugin": ["oh-my-opencode"] }\n')
    writeFileSync(omoConfig, '// unified fixture\n{ "telemetry": { "enabled": false } }\n')
    const before = {
      config: snapshot(env.XDG_CONFIG_HOME),
      omo: snapshot(omoDir),
    }

    const cli = join(import.meta.dir, "index.ts")
    for (const [label, args, expected] of [
      ["run", ["run", "--agent", "Atlas", "do work"], "Use the native command directly: opencode run"],
      ["config", ["config", "migrate", "--dry-run"], "OpenCode V1 configuration migration is retired"],
    ] as const) {
      const result = Bun.spawnSync([process.execPath, cli, ...args], { cwd: sandbox, env, stderr: "pipe" })
      expect(result.exitCode).toBe(1)
      expect(result.stderr.toString()).toContain(expected)
    }

    expect(readdirSync(sandbox)).not.toContain("host-spawned")
    expect(snapshot(env.XDG_CONFIG_HOME)).toEqual(before.config)
    expect(snapshot(omoDir)).toEqual(before.omo)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})
