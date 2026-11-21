import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { load } from "js-yaml"
import { z } from "zod"

import { DESKTOP_ENGINE_RELEASE_HOSTS } from "../packages/senpi-desktop-engine/src/release-assets"
import { PLATFORMS } from "./build-binaries"
import { DESKTOP_ENGINE_TARGETS } from "./release-desktop-engine-target"
import { desktopEngineLegs, sliceWorkflowSection } from "./release-workflow-test-steps"

const publishWorkflowPath = new URL("../.github/workflows/publish.yml", import.meta.url)
const publishPlatformWorkflowPath = new URL("../.github/workflows/publish-platform.yml", import.meta.url)

describe("release and platform publish workflows", () => {
  test("rolls back dist-tags for retained npm packages only", () => {
    const workflow = readFileSync(new URL("../.github/workflows/npm-dist-tag-rollback.yml", import.meta.url), "utf8")
    const directPackages = [...workflow.matchAll(/^\s*retag ([a-z-]+) /gm)].map((match) => match[1])
    expect(directPackages).toEqual(["oh-my-opencode", "oh-my-openagent", "lazycodex-ai"])
    expect(workflow).toContain('retag "oh-my-opencode-$plat" "$VERSION"')
    expect(workflow).toContain('retag "oh-my-openagent-$plat" "$VERSION"')
    const platforms = workflow
      .match(/PLATFORMS=\(([^)]+)\)/)?.[1]
      ?.split(/\s+/)
      .sort()
    expect(platforms).toEqual(PLATFORMS.map(({ platform }) => platform).sort())
  })

  test("neither workflow accepts operator-built standalone assets", () => {
    for (const path of [publishWorkflowPath, publishPlatformWorkflowPath]) {
      const workflow = readFileSync(path, "utf8")
      expect(workflow).not.toMatch(
        /operator_darwin_(?:artifacts|manifest_sha256)|operator-darwin|darwin-operator-build/,
      )
    }
  })

  test("enumerates windows-arm64 consistently across every platform-list surface", () => {
    // #given
    const publishSource = readFileSync(new URL("../script/publish.ts", import.meta.url), "utf8")
    const publishPlatformWorkflow = readFileSync(publishPlatformWorkflowPath, "utf8")

    const publishIdsBlock = publishSource.slice(
      publishSource.indexOf("PLATFORM_PACKAGE_IDS = ["),
      publishSource.indexOf("] as const"),
    )
    const publishIds = [...publishIdsBlock.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]).sort()

    const buildBinariesPlatforms = PLATFORMS.map((entry) => entry.platform).sort()

    const matrixLists = [...publishPlatformWorkflow.matchAll(/^\s*platform: \[([^\]]+)\]/gm)].map((match) =>
      match[1]
        .split(",")
        .map((value) => value.trim())
        .sort(),
    )

    const publishWorkflow = readFileSync(publishWorkflowPath, "utf8")
    const publishYmlLists = [
      ...[...publishWorkflow.matchAll(/PLATFORMS=\(([^)]+)\)/g)].map((match) => match[1]),
      ...[...publishWorkflow.matchAll(/for platform in (darwin-arm64[^\n;]*); do/g)].map((match) => match[1]),
    ].map((list) => list.trim().split(/\s+/).sort())

    // #when / #then
    expect(publishIds, "PLATFORM_PACKAGE_IDS must list windows-arm64").toContain("windows-arm64")
    expect(buildBinariesPlatforms, "build-binaries PLATFORMS must list windows-arm64").toContain("windows-arm64")
    expect(matrixLists.length, "publish-platform.yml must define both build and publish matrices").toBe(2)
    for (const matrixList of matrixLists) {
      expect(matrixList, "every publish-platform matrix must list windows-arm64").toContain("windows-arm64")
      expect(matrixList, "publish-platform matrix must match build-binaries PLATFORMS exactly").toEqual(
        buildBinariesPlatforms,
      )
    }
    expect(publishIds, "PLATFORM_PACKAGE_IDS must match build-binaries PLATFORMS exactly").toEqual(
      buildBinariesPlatforms,
    )
    expect(
      publishYmlLists.length,
      "publish.yml must enumerate platforms in 2 PLATFORMS arrays + 2 prepared-source version-bump loops",
    ).toBe(4)
    for (const publishYmlList of publishYmlLists) {
      expect(publishYmlList, "every publish.yml platform list must match build-binaries PLATFORMS exactly").toEqual(
        buildBinariesPlatforms,
      )
    }
  })

  test("matches the canonical platform set in optionalDependencies and on-disk platform packages", () => {
    // #given
    const rootManifest: { optionalDependencies?: Record<string, string> } = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    )
    const buildBinariesPlatforms = PLATFORMS.map((entry) => entry.platform).sort()
    const platformPrefix = "oh-my-opencode-"

    const optionalDependencyPlatforms = Object.keys(rootManifest.optionalDependencies ?? {})
      .filter((name) => name.startsWith(platformPrefix))
      .map((name) => name.slice(platformPrefix.length))
      .sort()

    const onDiskPlatforms = readdirSync(new URL("../packages/", import.meta.url))
      .filter((name) => name.startsWith(platformPrefix))
      .map((name) => name.slice(platformPrefix.length))
      .sort()

    // #when / #then
    expect(optionalDependencyPlatforms, "root optionalDependencies must list every canonical platform package").toEqual(
      buildBinariesPlatforms,
    )
    expect(onDiskPlatforms, "packages/ must contain a directory for every canonical platform package").toEqual(
      buildBinariesPlatforms,
    )
  })
})

describe("retained release assets", () => {
  test("builds the pinned Desktop targets and syntax-checks JavaScript launchers before upload", () => {
    const source = readFileSync(publishPlatformWorkflowPath, "utf8")
    const stepsSchema = z.array(
      z.object({
        name: z.string().optional(),
        run: z.string().optional(),
        uses: z.string().optional(),
        with: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    const jobSchema = z.object({ steps: stepsSchema })
    const { jobs } = z
      .object({
        jobs: z.object({
          "desktop-engine": jobSchema,
          "keychain-helper": jobSchema,
          build: jobSchema.extend({ needs: z.array(z.string()) }),
          publish: jobSchema.extend({ needs: z.string() }),
        }),
      })
      .parse(load(source))
    const engine = jobs["desktop-engine"]
    const legs = desktopEngineLegs(source)
    const stepIndex = (steps: z.infer<typeof stepsSchema>, name: string) => {
      const index = steps.findIndex((candidate) => candidate.name === name)
      if (index < 0) throw new Error("missing workflow step: " + name)
      return index
    }
    const install = stepIndex(engine.steps, "Install pinned Rust toolchain and target")
    const build = stepIndex(engine.steps, "Build desktop engine")
    const stage = stepIndex(engine.steps, "Stage desktop engine release asset")
    expect(engine.steps[install]?.run).toContain("rust-toolchain.toml")
    expect(engine.steps[install]?.run).toContain('rustup toolchain install "$toolchain"')
    expect(engine.steps[build]?.run).toContain('--target "${{ matrix.rust_target }}"')
    expect(engine.steps[stage]?.run).toContain("target/${{ matrix.rust_target }}/release/${{ matrix.binary }}")
    expect(install).toBeLessThan(build)
    expect(build).toBeLessThan(stage)
    expect(legs.map(({ host }) => host)).toEqual([...DESKTOP_ENGINE_RELEASE_HOSTS])
    for (const target of DESKTOP_ENGINE_TARGETS) {
      if (target.available) {
        const leg = legs.find(({ host }) => host === target.host)
        expect(leg).toBeDefined()
        expect(target.source).toBe(`target/${leg?.rust_target}/release/${leg?.binary}`)
      } else {
        expect(target.host).toBeNull()
        expect(target.source).toBeNull()
      }
    }

    for (const job of [engine, jobs["keychain-helper"], jobs.build]) {
      const checkout = job.steps.find(({ uses }) => uses?.startsWith("actions/checkout@"))
      expect(checkout?.with?.ref).toBe("${{ inputs.prepared_release_sha || github.sha }}")
    }
    expect(jobs.build.needs.toSorted()).toEqual(["desktop-engine", "keychain-helper"])
    expect(jobs.publish.needs).toBe("build")
    const launcher = stepIndex(jobs.build.steps, "Verify launcher")
    expect(jobs.build.steps[launcher]?.run).toContain("node --check")
    expect(launcher).toBeLessThan(stepIndex(jobs.build.steps, "Upload artifact"))
    expect(source).not.toMatch(/operator-darwin|build-omo-binary|smoke-linux-arm64/)
  })

  test("uploads one engine artifact per canonical host without baseline duplicates", () => {
    // Given the dedicated six-host build matrix.
    const workflow = readFileSync(publishPlatformWorkflowPath, "utf8")
    const engineJob = sliceWorkflowSection(workflow, "  desktop-engine:\n", "  build:\n")

    // When its host list is compared to the release asset contract, each asset has one producer.
    const hosts = desktopEngineLegs(workflow).map((leg) => leg.host)
    expect(hosts).toEqual([...DESKTOP_ENGINE_RELEASE_HOSTS])
    expect(new Set(hosts).size).toBe(6)
    expect(engineJob).toContain("name: desktop-engine-${{ matrix.host }}")
  })

  test("runs the staged locator proof for changes to the release target fixture", () => {
    // Given a fixture change on either CI event.
    const workflow = readFileSync(new URL("../.github/workflows/desktop-engine.yml", import.meta.url), "utf8")
    const triggers = sliceWorkflowSection(workflow, "on:\n", "concurrency:\n")
    const proof = sliceWorkflowSection(
      workflow,
      "      - name: Prove staged desktop engine resolution and selftest\n",
      "      - name: Verify release asset assembly without publishing\n",
    )

    // When the event paths are evaluated, both push and PR cover the fixture and target resolver.
    expect(triggers.match(/"script\/release-desktop-engine-fixture\.json"/g)).toHaveLength(2)
    expect(triggers.match(/"script\/release-desktop-engine-target\.ts"/g)).toHaveLength(2)
    expect(proof).toContain("bun script/desktop-engine-ci-proof.ts")
  })
})
