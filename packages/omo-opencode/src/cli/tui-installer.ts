import * as p from "@clack/prompts"
import { TELEMETRY_INSTALL_DISCLOSURE_LINES } from "@oh-my-opencode/telemetry-core/install-disclosure"
import color from "picocolors"
import type { InstallArgs } from "./types"
import { promptInstallConfig, promptInstallPlatform } from "./tui-install-prompts"
import { detectCodexInstallation, formatCodexInstallationWarning, runCodexInstaller } from "./install-codex"
import { starGitHubRepositories } from "./star-request"

export async function runTuiInstaller(args: InstallArgs): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("Error: Interactive installer requires a TTY. Use --no-tui for noninteractive Codex setup.")
    return 1
  }

  const selectedPlatform = await promptInstallPlatform(args.platform ?? "codex")
  if (selectedPlatform !== "codex") return 1

  const config = await promptInstallConfig(
    {
      isInstalled: false,
      installedVersion: null,
      hasClaude: false,
      isMax20: false,
      hasOpenAI: false,
      hasGemini: false,
      hasCopilot: false,
      hasCodex: false,
      hasOpencodeZen: false,
      hasZaiCodingPlan: false,
      hasKimiForCoding: false,
      hasOpencodeGo: false,
      hasBailianCodingPlan: false,
      hasMinimaxCnCodingPlan: false,
      hasMinimaxCodingPlan: false,
      hasVercelAiGateway: false,
    },
    selectedPlatform,
    args.codexAutonomous,
  )
  if (!config) return 1

  p.intro(color.bgMagenta(color.white(" oMoMoMoMo... ")))
  const spinner = p.spinner()

  const codexInstallation = await detectCodexInstallation()
  if (!codexInstallation.found) {
    p.log.warn(formatCodexInstallationWarning(codexInstallation))
  }

  spinner.start("Installing Codex harness adapter")
  try {
    const codexResult = await runCodexInstaller({ autonomousPermissions: config.codexAutonomous })
    spinner.stop(`Codex plugin installed to ${color.cyan(codexResult.configPath)}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    spinner.stop(`Codex install failed ${color.yellow("[!]")}`)
    p.log.error(`Codex install failed: ${message}`)
    p.outro(color.red("Installation failed."))
    return 1
  }

  p.log.success(color.bold("Installation complete!"))
  p.log.info(TELEMETRY_INSTALL_DISCLOSURE_LINES.join("\n"))
  p.note(
    `Include ${color.cyan("ultrawork")} (or ${color.cyan("ulw")}) in your prompt.\n` +
      `All features work like magic-parallel agents, background tasks,\n` +
      `deep exploration, and relentless execution until completion.`,
    "The Magic Word",
  )

  const shouldStar = await p.confirm({
    message: "Star the repos on GitHub?",
    initialValue: false,
  })
  if (!p.isCancel(shouldStar) && shouldStar) {
    spinner.start("Starring GitHub repositories")
    const results = await starGitHubRepositories("codex")
    const failed = results.filter((result) => !result.ok)
    spinner.stop(failed.length === 0 ? "GitHub repositories starred" : "Could not star every repository")
    if (failed.length > 0) {
      p.log.warn("Make sure GitHub CLI is installed and authenticated.")
    }
  }

  p.outro(color.green("oMoMoMoMo... Enjoy!"))
  return 0
}
