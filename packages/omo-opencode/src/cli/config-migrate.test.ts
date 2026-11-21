import { expect, test } from "bun:test"
import { runConfigMigrate } from "./config-migrate"

test("rejects OpenCode migration before any write and preserves Codex guidance", () => {
  const lines: string[] = []

  expect(runConfigMigrate({ dryRun: true, json: true, output: lines.push })).toBe(1)
  expect(lines).toContain("Error: OpenCode V1 configuration migration is retired and performs no writes.")
  expect(lines).toContain("install --platform=codex")
})

test("ignores retired control flags without changing the rejection", () => {
  const lines: string[] = []

  expect(runConfigMigrate({ dryRun: false, json: true, output: lines.push })).toBe(1)
  expect(lines).toHaveLength(2)
  expect(lines[0]).toContain("performs no writes")
})
