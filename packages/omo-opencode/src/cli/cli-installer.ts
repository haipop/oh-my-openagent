import { createInterface } from "node:readline/promises"
import { TELEMETRY_INSTALL_DISCLOSURE_LINES } from "@oh-my-opencode/telemetry-core/install-disclosure"
import color from "picocolors"
import { PUBLISHED_PACKAGE_NAME } from "../shared"
import type { InstallArgs } from "./types"
import {
  printBox,
  printError,
  printHeader,
  printInfo,
  printSuccess,
  printWarning,
  SYMBOLS,
  validateNonTuiArgs,
} from "./install-validators"
import { runCodexInstaller } from "./install-codex"
import { starGitHubRepositories } from "./star-request"

export async function runCliInstaller(args: InstallArgs): Promise<number> {
  if (args.platform !== "codex") {
    printError("Only the Codex installer is active. Re-run with --platform=codex.")
    return 1
  }

  const validation = validateNonTuiArgs(args)
  if (!validation.valid) {
    printHeader(false)
    printError("Validation failed:")
    for (const err of validation.errors) {
      console.log(`  ${SYMBOLS.bullet} ${err}`)
    }
    printInfo(`Usage: bunx ${PUBLISHED_PACKAGE_NAME} install --no-tui --platform=codex`)
    return 1
  }

  printHeader(false)
  printInfo("Installing Codex harness adapter...")
  try {
    const codexResult = await runCodexInstaller({ autonomousPermissions: args.codexAutonomous !== false })
    printSuccess(`Codex plugin installed ${SYMBOLS.arrow} ${color.dim(codexResult.configPath)}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    printError(`Codex install failed: ${message}`)
    return 1
  }

  console.log(`${SYMBOLS.star} ${color.bold(color.green("Installation complete!"))}`)
  console.log()
  for (const line of TELEMETRY_INSTALL_DISCLOSURE_LINES) printInfo(line)
  console.log()
  printBox(
    `${color.bold("Pro Tip:")} Include ${color.cyan("ultrawork")} (or ${color.cyan("ulw")}) in your prompt.\n` +
      `All features work like magic-parallel agents, background tasks,\n` +
      `deep exploration, and relentless execution until completion.`,
    "The Magic Word",
  )

  if (args.tui) await maybePromptForGitHubStars()
  console.log(color.dim("oMoMoMoMo... Enjoy!"))
  console.log()
  return 0
}

async function maybePromptForGitHubStars(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return

  const readline = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await readline.question(
      `${SYMBOLS.star} ${color.yellow("Star the repos on GitHub?")} ${color.dim("[y/N]")} `,
    )
    if (!isYes(answer)) return
  } finally {
    readline.close()
  }

  const results = await starGitHubRepositories("codex")
  const failed = results.filter((result) => !result.ok)
  if (failed.length === 0) {
    printSuccess("Starred GitHub repositories")
    console.log()
    return
  }

  printWarning("Could not star every repository. Make sure GitHub CLI is installed and authenticated.")
  for (const result of failed) {
    console.log(`  ${SYMBOLS.bullet} ${result.repository}`)
  }
  console.log()
}

function isYes(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized === "y" || normalized === "yes"
}
