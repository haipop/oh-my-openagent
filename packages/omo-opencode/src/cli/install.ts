import type { InstallArgs } from "./types"
import { runCliInstaller } from "./cli-installer"
import { runTuiInstaller } from "./tui-installer"

export async function install(args: InstallArgs): Promise<number> {
  if (args.platform !== "codex") {
    if (!args.platform) {
      console.error("Only Codex installation is active. Re-run with --platform=codex.")
    } else {
      console.error(`The ${args.platform} installer is retired. Only --platform=codex is active.`)
    }
    console.error(
      "OpenCode V2 uses project-local plugin setup; the V1, native, and native-dev installers do not write configuration.",
    )
    return 1
  }
  return args.tui ? runTuiInstaller(args) : runCliInstaller(args)
}
