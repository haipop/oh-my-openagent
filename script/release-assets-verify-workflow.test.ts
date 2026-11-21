import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  DESKTOP_ENGINE_RELEASE_HOSTS,
  desktopEngineReleaseAssetName,
} from "../packages/senpi-desktop-engine/src/release-assets"
import { KEYCHAIN_HELPER_RELEASE_ASSET } from "./release-keychain-helper-target"
import { runBlock } from "./release-workflow-test-steps"

const workflow = readFileSync(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n",
)
const verifyStep = runBlock(workflow, "      - name: Verify uploaded assets\n", "      - name: Delete draft release\n")
const ENGINE_MANIFEST = "senpi-desktop-engine-checksums.txt"
const ENGINES = DESKTOP_ENGINE_RELEASE_HOSTS.map((host) => {
  const asset = desktopEngineReleaseAssetName(host)
  if (asset === null) throw new Error("missing engine asset name: " + host)
  return asset
})
const FIRST_ENGINE = ENGINES[0]!

type Files = Record<string, string>

function checksums(files: Files, names: readonly string[]): string {
  return names.map((name) => createHash("sha256").update(files[name]!).digest("hex") + "  " + name + "\n").join("")
}

function release(): Files {
  const files = Object.fromEntries([KEYCHAIN_HELPER_RELEASE_ASSET, ...ENGINES].map((name) => [name, name + "\n"]))
  return {
    ...files,
    SHA256SUMS: checksums(files, [KEYCHAIN_HELPER_RELEASE_ASSET]),
    [ENGINE_MANIFEST]: checksums(files, ENGINES),
  }
}

function runVerify(released: Files, built: Files | null, payloadDirectories: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "omo-release-assets-"))
  try {
    const releaseDir = join(root, "release")
    const checkout = join(root, "checkout")
    const bin = join(root, "bin")
    const temp = join(root, "tmp")
    for (const dir of [releaseDir, checkout, bin, temp]) mkdirSync(dir)
    for (const [name, bytes] of Object.entries(released)) writeFileSync(join(releaseDir, name), bytes)
    if (built !== null) {
      const builtDir = join(checkout, ".omo", "release-binaries")
      mkdirSync(builtDir, { recursive: true })
      for (const [name, bytes] of Object.entries(built)) writeFileSync(join(builtDir, name), bytes)
      for (const name of payloadDirectories) {
        mkdirSync(join(builtDir, name))
        writeFileSync(join(builtDir, name, "omo-engine-trust-helper"), "payload\n")
      }
    }
    writeFileSync(
      join(bin, "gh"),
      [
        "#!/bin/bash",
        "set -eu",
        '[[ "$1" == release && "$3" == v5.0.0 ]]',
        'if [[ "$2" == view ]]; then',
        '  [[ "$4" == --json && "$5" == assets && "$6" == --jq && "$7" == ".assets[].name" ]]',
        '  for file in "$RELEASE_DIR"/*; do printf "%s\n" "${file##*/}"; done',
        "  exit 0",
        "fi",
        '[[ "$2" == download ]]',
        "shift 3",
        "patterns=()",
        'while [[ "$#" -gt 0 ]]; do',
        '  case "$1" in --pattern) patterns+=("$2");; --dir) dir="$2";; *) exit 2;; esac',
        "  shift 2",
        "done",
        'for pattern in "${patterns[@]}"; do cp "$RELEASE_DIR/$pattern" "$dir/"; done',
        "",
      ].join("\n"),
      { mode: 0o755 },
    )
    const result = spawnSync("bash", ["-ec", verifyStep], {
      cwd: checkout,
      env: {
        PATH: bin + ":" + (process.env.PATH ?? ""),
        RELEASE_DIR: releaseDir,
        VERSION: "5.0.0",
        TMPDIR: temp,
      },
      encoding: "utf8",
      timeout: 20_000,
    })
    expect(readdirSync(temp)).toEqual([])
    return { status: result.status, output: result.stdout + result.stderr }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe("release verification for the retained assets", () => {
  test("accepts the keychain helper, six engines and both manifests when they match the build", () => {
    const files = release()
    const run = runVerify(files, files, ["engine-trust-helper-darwin-arm64"])
    expect(run.status, run.output).toBe(0)
    expect(run.output).toContain("Verified 9 release assets")
  })

  test("rejects a retired binary that is not part of the release", () => {
    const run = runVerify({ ...release(), "omo-linux-x64": "retired" }, null)
    expect(run.status).not.toBe(0)
    expect(run.output).toContain("+omo-linux-x64")
  })

  test("rejects a missing uploaded engine or helper", () => {
    for (const missing of [FIRST_ENGINE, KEYCHAIN_HELPER_RELEASE_ASSET]) {
      const files = release()
      delete files[missing]
      const run = runVerify(files, release())
      expect(run.status).not.toBe(0)
      expect(run.output).toContain("-" + missing)
    }
  })

  test("rejects a self-consistent upload whose bytes differ from this run's build", () => {
    const built = release()
    const released = { ...built, [FIRST_ENGINE]: "other build" }
    released[ENGINE_MANIFEST] = checksums(released, ENGINES)
    expect(runVerify(released, built).status).not.toBe(0)
  })

  test("requires a checksum for each engine and the helper", () => {
    for (const [manifest, missing, remaining] of [
      [ENGINE_MANIFEST, FIRST_ENGINE, ENGINES.slice(1)],
      ["SHA256SUMS", KEYCHAIN_HELPER_RELEASE_ASSET, []],
    ] as const) {
      const files = release()
      files[manifest] = checksums(files, remaining)
      const run = runVerify(files, null)
      expect(run.status).not.toBe(0)
      expect(run.output).toContain("-" + missing)
    }
  })

  test("a skip-platform rerun verifies the previously published bytes", () => {
    const files = release()
    const valid = runVerify(files, null)
    expect(valid.status, valid.output).toBe(0)
    for (const name of [FIRST_ENGINE, KEYCHAIN_HELPER_RELEASE_ASSET]) {
      const run = runVerify({ ...files, [name]: "corrupt" }, null)
      expect(run.status).not.toBe(0)
      expect(run.output).toContain(name + ": FAILED")
    }
  })
})
