import { execFileSync } from "node:child_process"
import { join } from "node:path"

import { withTelemetryOptOut } from "./telemetry-opt-out-env.mjs"

export function isolatedEnvironment(sandbox) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(OMO_|SENPI_|PI_)/.test(key) || /(_PACKAGE_DIR|API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)$/.test(key))
      delete env[key]
  }
  for (const key of ["HOME", "USERPROFILE", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME"])
    env[key] = join(sandbox, "home")
  env.OMO_CODING_AGENT_DIR = join(sandbox, "agent")
  env.SENPI_CODING_AGENT_DIR = env.OMO_CODING_AGENT_DIR
  env.SENPI_RUNTIME = process.versions.bun ? "bun" : "node"
  for (const key of ["TMPDIR", "TMP", "TEMP"]) env[key] = join(sandbox, "tmp")
  env.PI_OFFLINE = "1"
  return withTelemetryOptOut(env)
}

export function processGroupMembers(groupId) {
  return execFileSync("ps", ["-axo", "pid=,ppid=,pgid=,command="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((line) => Number(line.trim().split(/\s+/)[2]) === groupId)
}
