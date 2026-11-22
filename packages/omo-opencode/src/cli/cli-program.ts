import { Command, Option } from "commander"
import { install } from "./install"
import { configureCleanupCommand, resolveCleanupPlatform } from "./cleanup-command"
import { doctor, resolveDoctorTarget } from "./doctor"
import { createMcpOAuthCommand } from "./mcp-oauth"
import { configureAccountKeysCommands } from "./account-keys/commands"
import "./service-auth/cli-service-auth-hooks"
import { serviceAccountsOpen } from "./service-auth/accounts-gate"
import { openCodeServiceAuthHooks } from "./service-auth/cli-service-auth-state"
import { configureServiceAuthCommands } from "./service-auth/commands"
import { resolveInstallArgs, type InstallCommandOptions } from "./install-command-options"
import { configureRuntimeCommands } from "./runtime-commands"
import { runConfigMigrate } from "./config-migrate"
import { availableInstallPlatforms } from "./native-dev-platform-flag"
import type { InstallArgs } from "./types"
import type { DoctorOptions } from "./doctor"
import packageJson from "../../../../package.json" with { type: "json" }

const VERSION = packageJson.version
const program = new Command()

type RootCommandOptions = {
  readonly platform?: InstallArgs["platform"]
}

type DoctorCommandOptions = {
  readonly status?: boolean
  readonly verbose?: boolean
  readonly json?: boolean
  readonly platform?: DoctorOptions["target"]
}

export { resolveInstallArgs } from "./install-command-options"
export { resolveCleanupPlatform }

program
  .name("oh-my-opencode")
  .description("The ultimate OpenCode plugin - multi-model orchestration, LSP tools, and more")
  .version(VERSION, "-v, --version", "Show version number")
  .helpOption("-h, --help", "Display help for command")
  .addOption(
    new Option("--platform <platform>", `Install target platform: ${availableInstallPlatforms().join(", ")}`)
      .choices(availableInstallPlatforms())
      .hideHelp(),
  )
  .enablePositionalOptions()

program
  .command("install")
  .alias("setup")
  .description("Install the Codex harness adapter")
  .option("--no-tui", "Run in non-interactive mode (requires all options)")
  .addOption(
    new Option("--platform <platform>", `Install target platform: ${availableInstallPlatforms().join(", ")}`).choices(
      availableInstallPlatforms(),
    ),
  )
  .option("--codex-autonomous", "Configure Codex with approval never, full filesystem access, and network enabled")
  .option("--no-codex-autonomous", "Leave existing Codex permission settings unchanged")
  .option("--skip-auth", "Skip authentication setup hints")
  .addHelpText("after", `
Examples:
  $ bunx oh-my-openagent install --platform=codex
  $ npx lazycodex-ai install --no-tui
  $ omo-agent-toolkit install --platform=codex --codex-autonomous
`)
  .action(async (options: InstallCommandOptions) => {
    const rootOptions = program.opts<RootCommandOptions>()
    const args = resolveInstallArgs({ ...options, platform: options.platform ?? rootOptions.platform })
    const exitCode = await install(args)
    process.exit(exitCode)
  })

configureCleanupCommand(program)

program
  .command("run")
  .description("Retired V1 session launcher; use native opencode run")
  .argument("[message...]")
  .allowUnknownOption()
  .action(() => {
    console.error("Error: The OmO V1 run wrapper is retired and does not start OpenCode or create sessions.")
    console.error("Use the native command directly: opencode run")
    process.exit(1)
  })

program
  .command("doctor")
  .description("Check oh-my-opencode installation health and diagnose issues")
  .option("--status", "Show compact system dashboard")
  .option("--verbose", "Show detailed diagnostic information")
  .option("--json", "Output results in JSON")
  .addOption(
    new Option("--platform <platform>", "Doctor target platform: opencode, codex").choices(["opencode", "codex"]),
  )
  .addHelpText("after", `
Examples:
  $ bunx oh-my-openagent doctor            # Show problems only
  $ bunx oh-my-openagent doctor --status   # Compact dashboard
  $ bunx oh-my-openagent doctor --verbose  # Deep diagnostics
  $ bunx oh-my-openagent doctor --json     # JSON output
  $ omo-agent-toolkit doctor --platform=codex   # Codex/LazyCodex diagnostics only
`)
  .action(async (options: DoctorCommandOptions) => {
    const rootOptions = program.opts<RootCommandOptions>()
    const rootDoctorPlatform =
      rootOptions.platform === "opencode" || rootOptions.platform === "codex" ? rootOptions.platform : undefined
    const mode = options.status ? "status" : options.verbose ? "verbose" : "default"
    const doctorOptions: DoctorOptions = {
      mode,
      json: options.json ?? false,
      target: resolveDoctorTarget(process.env.OMO_INVOCATION_NAME, options.platform ?? rootDoctorPlatform),
    }
    const exitCode = await doctor(doctorOptions)
    process.exit(exitCode)
  })

program
  .command("config")
  .description("Manage unified OMO configuration")
  .command("migrate")
  .description("Migrate legacy configuration to unified OmO configuration")
  .option("--dry-run", "Preview without changing configuration")
  .option("--json", "Print a machine-readable migration report")
  .action((options: { dryRun?: boolean; json?: boolean }) => {
    const exitCode = runConfigMigrate(options)
    process.exit(exitCode)
  })

configureRuntimeCommands(program)
program.addCommand(createMcpOAuthCommand())
configureServiceAuthCommands(program, serviceAccountsOpen(), openCodeServiceAuthHooks())
configureAccountKeysCommands(program)

export function runCli(): void {
  program.parse()
}

export { openCodeServiceAuthHooks }
