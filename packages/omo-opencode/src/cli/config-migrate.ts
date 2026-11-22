import path from "node:path"
import { previewMigrations, runMigrations, type MigrationRunResult } from "@oh-my-opencode/omo-config-core"
import { createLegacyConfigMigrationPlans } from "../config-migration"

export type ConfigMigrateOptions = {
  readonly cwd?: string
  readonly dryRun?: boolean
  readonly environment?: Readonly<Record<string, string | undefined>>
  readonly json?: boolean
  readonly output?: (line: string) => void
}

function reportEntry(entry: MigrationRunResult) {
  return {
    diagnostics: entry.diagnostics,
    movePlan: entry.preview?.backupMoves ?? [],
    status: entry.status,
    targetBackupPath: entry.targetBackupPath,
    targetPath: entry.preview?.targetPath,
    transform: entry.preview?.transform,
  }
}

type MigrationReport = {
  readonly dryRun: boolean
  readonly error?: string
  readonly journalResumed: boolean
  readonly migratedFrom: readonly string[]
  readonly migrations: readonly ReturnType<typeof reportEntry>[]
  readonly skippedConflictCount: number
  readonly targetBackupPaths: readonly string[]
}

function reportFor(options: ConfigMigrateOptions): MigrationReport {
  const environment = options.environment ?? process.env
  const homeDir = environment["HOME"] || environment["USERPROFILE"]
  const dryRun = options.dryRun ?? false
  const emptyReport = {
    dryRun,
    journalResumed: false,
    migratedFrom: [],
    migrations: [],
    skippedConflictCount: 0,
    targetBackupPaths: [],
  }
  try {
    if (!homeDir) throw new Error("Cannot migrate configuration because no home directory is available")
    const migration = {
      env: { HOME: homeDir },
      discover: () =>
        createLegacyConfigMigrationPlans({
          cwd: options.cwd ?? process.cwd(),
          environment,
          homeDir,
          pathOperations: path,
          platform: process.platform,
        }),
    }
    const batch = dryRun ? previewMigrations(migration) : runMigrations(migration)
    if (batch.status === "locked") throw new Error("Configuration migration is already running")
    const migrations = batch.results.map(reportEntry)
    return {
      dryRun,
      journalResumed: batch.journalResumed,
      migratedFrom: [
        ...new Set(
          migrations
            .filter(({ status }) => status === "migrated")
            .flatMap(({ movePlan }) => movePlan.map(({ from }) => from)),
        ),
      ].sort(),
      migrations,
      skippedConflictCount: migrations
        .flatMap(({ diagnostics }) => diagnostics)
        .filter((diagnostic) => diagnostic.startsWith("skipped:")).length,
      targetBackupPaths: [
        ...(batch.resumedTargetBackupPath === undefined ? [] : [batch.resumedTargetBackupPath]),
        ...migrations.flatMap(({ targetBackupPath }) => (targetBackupPath === undefined ? [] : [targetBackupPath])),
      ],
    }
  } catch (error) {
    return { ...emptyReport, error: error instanceof Error ? error.message : String(error) }
  }
}

export function runConfigMigrate(options: ConfigMigrateOptions = {}): number {
  const output = options.output ?? console.log
  const report = reportFor(options)
  if (options.json) {
    output(JSON.stringify(report, null, 2))
  } else if (report.error !== undefined) {
    output(`Configuration migration failed: ${report.error}`)
  } else {
    if (report.journalResumed) output("Recovered pending migration journal.")
    for (const entry of report.migrations) {
      output(`status: ${entry.status}`)
      if (entry.targetPath !== undefined) output(`target: ${entry.targetPath}`)
      if (entry.transform !== undefined) output(`transform: ${JSON.stringify(entry.transform, null, 2)}`)
      if (entry.movePlan.length > 0) output(`move-plan: ${JSON.stringify(entry.movePlan, null, 2)}`)
      for (const diagnostic of entry.diagnostics) output(`conflict: ${diagnostic}`)
    }
    for (const backup of report.targetBackupPaths) output(`backup: ${backup}`)
    if (report.migrations.every(({ status }) => status === "skipped")) output("Nothing to migrate.")
  }
  return report.error === undefined ? 0 : 1
}
