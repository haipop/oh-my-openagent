import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

const workflowPath = new URL("../.github/workflows/publish.yml", import.meta.url)
const workflow = Bun.YAML.parse(readFileSync(workflowPath, "utf8")) as {
  jobs: Record<
    string,
    { "timeout-minutes": number; steps: Array<{ name?: string; run?: string; env?: Record<string, string> }> }
  >
}
const verify = workflow.jobs["post-publish-verify"]
const readiness = verify.steps.find((step) => step.name === "Wait for every published package on the registry")
if (!readiness?.run) throw new Error("post-publish-verify is missing the shared registry readiness step")
const readinessRun = readiness.run

function runReadiness(lazycodexOnly: boolean, publishLazycodex: boolean, probeExit = 0) {
  const result = spawnSync("bash", ["-c", `node() { printf '%s\\n' "$@"; return "$PROBE_EXIT"; }\n${readinessRun}`], {
    encoding: "utf8",
    timeout: process.platform === "win32" ? 30_000 : 5_000,
    env: {
      ...process.env,
      VERSION: "5.1.38",
      LAZYCODEX_ONLY: String(lazycodexOnly),
      PUBLISH_LAZYCODEX: String(publishLazycodex),
      PROBE_EXIT: String(probeExit),
    },
  })
  if (result.error) throw result.error
  return { status: result.status, args: result.stdout.trim().split("\n") }
}

const mainSpecs = [
  "script/wait-registry-versions.mjs",
  "--platform-packages",
  "5.1.38",
  "oh-my-opencode@5.1.38",
  "oh-my-openagent@5.1.38",
]

describe("publish.yml post-publish-verify registry readiness", () => {
  test("checks both main packages and their platforms without LazyCodex when not published", () => {
    expect(runReadiness(false, false)).toEqual({ status: 0, args: mainSpecs })
  })

  test("waits for LazyCodex and both main package families under one deadline when all are published", () => {
    expect(runReadiness(false, true)).toEqual({ status: 0, args: [...mainSpecs, "lazycodex-ai@5.1.38"] })
  })

  test("the LazyCodex-only release does not wait for unpublished main or platform packages", () => {
    expect(runReadiness(true, true)).toEqual({
      status: 0,
      args: ["script/wait-registry-versions.mjs", "lazycodex-ai@5.1.38"],
    })
  })

  test("a missing version reported by the shared verifier fails the workflow step", () => {
    expect(runReadiness(false, true, 17).status).toBe(17)
  })

  test("leaves at least an hour for registry propagation within the job timeout", () => {
    const seconds = Number(readiness.env?.REGISTRY_WAIT_DEADLINE_SECONDS)
    expect(seconds).toBeGreaterThanOrEqual(3600)
    expect(seconds).toBeLessThan(verify["timeout-minutes"] * 60)
  })
})
