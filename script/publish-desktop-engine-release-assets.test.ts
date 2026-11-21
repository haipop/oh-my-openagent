import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { desktopEngineReleaseAssetName } from "../packages/senpi-desktop-engine/src/release-assets"
import { writeDesktopEngineChecksums } from "./desktop-engine-release"
import { desktopEngineLegs } from "./release-workflow-test-steps"

type Step = { name?: string; with?: Record<string, string | boolean> }
type Workflow = { jobs: Record<string, { steps?: Step[] }> }

function source(name: string): string {
  return readFileSync(new URL("../.github/workflows/" + name, import.meta.url), "utf8").replace(/\r\n/g, "\n")
}

test("the release assembles checksums from all six hosted Desktop engine artifacts", () => {
  const platform = source("publish-platform.yml")
  const workflow = Bun.YAML.parse(source("publish.yml")) as Workflow
  const download = workflow.jobs.release?.steps?.find(({ name }) => name === "Download desktop-engine artifacts")
  expect(download?.with).toMatchObject({ pattern: "desktop-engine-*", "merge-multiple": true })

  const root = mkdtempSync(join(tmpdir(), "desktop-engine-release-"))
  try {
    const artifacts = join(root, "artifacts")
    const release = join(root, "release")
    mkdirSync(release)
    const expected = []
    for (const { host } of desktopEngineLegs(platform)) {
      const asset = desktopEngineReleaseAssetName(host)
      if (asset === null) throw new Error("missing Desktop engine asset name: " + host)
      const bytes = "engine bytes for " + host
      const directory = join(artifacts, "desktop-engine-" + host)
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, asset), bytes)
      expected.push(createHash("sha256").update(bytes).digest("hex") + "  " + asset)
    }
    const pattern = new Bun.Glob(String(download?.with?.pattern))
    for (const name of readdirSync(artifacts).filter((candidate) => pattern.match(candidate))) {
      cpSync(join(artifacts, name), release, { recursive: true })
    }
    const manifest = readFileSync(writeDesktopEngineChecksums(release), "utf8").trimEnd().split("\n")
    expect(manifest).toHaveLength(6)
    expect(manifest.sort()).toEqual(expected.sort())
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
