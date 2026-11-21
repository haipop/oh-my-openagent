export type ConfigMigrateOptions = {
  readonly dryRun?: boolean
  readonly json?: boolean
  readonly output?: (line: string) => void
}

export function runConfigMigrate(_options: ConfigMigrateOptions = {}): number {
  const output = _options.output ?? console.error
  output("Error: OpenCode V1 configuration migration is retired and performs no writes.")
  output(
    "Manage OpenCode V2 through its project-local plugin configuration. Codex installation and configuration remain available through install --platform=codex.",
  )
  return 1
}
