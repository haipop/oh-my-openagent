import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))
const baseConfigPath = new URL("../bunfig.toml", import.meta.url)
const rootConfigPath = new URL("../bunfig.root.toml", import.meta.url)
const workflowPath = new URL("../.github/workflows/ci.yml", import.meta.url)

function quotedPatterns(config: string): readonly string[] {
  return [...config.matchAll(/"([^"]+\/\*\*)"/g)].map((match) => match[1] ?? "")
}

function spawnBun(args: readonly string[]): string {
  const result = Bun.spawnSync({
    cmd: [process.execPath, ...args],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  })
  return `${new TextDecoder().decode(result.stdout)}${new TextDecoder().decode(result.stderr)}`
}

describe("root test Bun config", () => {
  test("#given package-specific CI jobs #when the root suite config is inspected #then every base ignore remains active", () => {
    expect(existsSync(rootConfigPath)).toBe(true)
    if (!existsSync(rootConfigPath)) return

    const basePatterns = quotedPatterns(readFileSync(baseConfigPath, "utf8"))
    const rootPatterns = quotedPatterns(readFileSync(rootConfigPath, "utf8"))

    for (const pattern of basePatterns) {
      expect(rootPatterns).toContain(pattern)
    }
  })

  test("#given bun 1.3.x test argv #when CI selects the dedicated config #then --config= is passed before test", () => {
    const workflow = readFileSync(workflowPath, "utf8")
    const posixShard2 = readFileSync(new URL("../.github/scripts/ci-root-shard-2.sh", import.meta.url), "utf8")
    expect(workflow).toContain("bash .github/scripts/ci-root-shard-2.sh")
    expect(posixShard2).toContain(
      "bun --config=bunfig.win2.parallel.toml test --timeout 20000 $(junit root-2-remainder)\n",
    )
    expect(posixShard2).toContain("bun --config=bunfig.win2.parallel.toml test --timeout 20000 --shard=")
    expect(posixShard2).not.toContain("bun test -c")
    expect(workflow).not.toContain("bun test -c")
    expect(workflow).not.toContain("format('-c {0}'")
    expect(workflow).not.toContain("--path-ignore-patterns=")
  })

  test("#given the macOS shard-2 light config #when bun discovers a top-level script test #then it is left to the heavy half", () => {
    const output = spawnBun([
      "--config=bunfig.win2.parallel.rest.toml",
      "test",
      "script/ci-root-test-partition.test.ts",
    ])
    expect(output).toContain("filters did not match any test files")
  })
})
