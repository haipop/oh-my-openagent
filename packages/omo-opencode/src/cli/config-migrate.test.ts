import { expect, test } from "bun:test"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { migrationJournalPath, runMigrations } from "@oh-my-opencode/omo-config-core"

function withFixture(
  run: (fixture: {
    invoke: (...args: string[]) => ReturnType<typeof Bun.spawnSync>
    home: string
    legacy: string
    target: string
  }) => void,
): void {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "omo-native-config-migration-")))
  try {
    const configHome = join(home, "config")
    const configDirectory = join(configHome, "opencode")
    const legacy = join(configDirectory, "oh-my-openagent.json")
    const project = join(home, "project")
    const target = join(home, ".omo", "omo.json")
    mkdirSync(project)
    mkdirSync(configDirectory, { recursive: true })
    writeFileSync(legacy, JSON.stringify({ disabled_providers: ["anthropic"], model_fallback: true }))
    const invoke = (...args: string[]) =>
      Bun.spawnSync([process.execPath, join(import.meta.dir, "index.ts"), "config", "migrate", ...args], {
        cwd: project,
        env: {
          HOME: home,
          USERPROFILE: home,
          XDG_CONFIG_HOME: configHome,
          XDG_DATA_HOME: join(home, "data"),
          XDG_CACHE_HOME: join(home, "cache"),
          XDG_STATE_HOME: join(home, "state"),
        },
        stderr: "pipe",
      })
    run({ invoke, home, legacy, target })
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

test("#given a legacy file and existing unified edits #when previewing and applying #then edits win and backups are reported", () => {
  withFixture(({ invoke, home, legacy, target }) => {
    const directory = join(home, ".omo")
    const current = '{"[opencode]":{"model_fallback":false}}\n'
    mkdirSync(directory)
    writeFileSync(target, current)
    const sourceBytes = readFileSync(legacy, "utf8")
    const preview = invoke("--dry-run", "--json")
    expect(preview.stderr.toString()).toBe("")
    expect(preview.exitCode).toBe(0)
    const plan = JSON.parse(preview.stdout.toString())
    expect(plan.dryRun).toBe(true)
    expect(plan.migrations[0]).toMatchObject({ status: "planned", targetPath: target, movePlan: [{ from: legacy }] })
    expect(readdirSync(directory)).toEqual(["omo.json"])
    expect(readFileSync(target, "utf8")).toBe(current)
    expect(readFileSync(legacy, "utf8")).toBe(sourceBytes)

    const invalid = invoke("--dry-rnu")
    expect(invalid.exitCode).toBe(1)
    expect(readFileSync(legacy, "utf8")).toBe(sourceBytes)

    const apply = invoke("--json")
    expect(apply.exitCode).toBe(0)
    const report = JSON.parse(apply.stdout.toString())
    expect(report.migratedFrom).toEqual([legacy])
    expect(report.migrations[0].targetPath).toBe(target)
    expect(readFileSync(report.migrations[0].movePlan[0].to, "utf8")).toBe(sourceBytes)
    expect(readFileSync(report.targetBackupPaths[0], "utf8")).toBe(current)
    const migrated = readFileSync(target, "utf8")
    expect(JSON.parse(migrated)["[opencode]"]).toMatchObject({
      disabled_providers: ["anthropic"],
      model_fallback: false,
    })
    expect(existsSync(legacy)).toBe(false)
    expect(existsSync(join(directory, "omo.jsonc"))).toBe(false)

    const after = readdirSync(directory).sort()
    const repeat = invoke("--json")
    expect(repeat.exitCode).toBe(0)
    expect(JSON.parse(repeat.stdout.toString()).migratedFrom).toEqual([])
    expect(readFileSync(target, "utf8")).toBe(migrated)
    expect(readdirSync(directory).sort()).toEqual(after)
  })
})

test("#given an interrupted transaction #when previewing #then only explicit apply may recover it", () => {
  withFixture(({ invoke, home, legacy, target }) => {
    const env = { HOME: home }
    const journal = migrationJournalPath(env)
    expect(() =>
      runMigrations({
        env,
        discover: () => [
          {
            id: "interrupted",
            sources: [{ path: legacy }],
            targetPath: target,
            transform: () => ({ "[opencode]": { model_fallback: true } }),
          },
        ],
        onBoundary: () => {
          throw new Error("interrupted")
        },
      }),
    ).toThrow("interrupted")
    const bytes = readFileSync(journal, "utf8")

    const preview = invoke("--dry-run", "--json")
    expect(preview.exitCode).toBe(1)
    expect(JSON.parse(preview.stdout.toString())).toMatchObject({ dryRun: true, journalResumed: false })
    expect(readFileSync(journal, "utf8")).toBe(bytes)
    expect(existsSync(target)).toBe(false)
    expect(existsSync(legacy)).toBe(true)

    const apply = invoke("--json")
    expect(apply.exitCode).toBe(0)
    expect(JSON.parse(apply.stdout.toString()).journalResumed).toBe(true)
    expect(existsSync(journal)).toBe(false)
    expect(existsSync(legacy)).toBe(false)
    expect(existsSync(target)).toBe(true)
  })
})
