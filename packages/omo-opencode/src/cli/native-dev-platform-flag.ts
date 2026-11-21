import type { InstallPlatform } from "./types"

export function availableInstallPlatforms(env: NodeJS.ProcessEnv = process.env): InstallPlatform[] {
  void env
  return ["codex"]
}
