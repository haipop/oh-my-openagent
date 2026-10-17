import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  configFilesFor,
  loadMergedConfig,
  mergeConfigLayers,
  parseConfigText,
  readConfigFile,
  stripJsonc,
} from "../lib/config-file.js"

const tempRoots: string[] = []

afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true })
})

function createProject(files: Record<string, string>, nested?: string): string {
  const root = mkdtempSync(join(tmpdir(), "omo-dsh-config-"))
  tempRoots.push(root)
  const directory = nested === undefined ? root : join(root, nested)
  mkdirSync(join(directory, ".omo"), { recursive: true })
  for (const [name, content] of Object.entries(files)) writeFileSync(join(directory, ".omo", name), content)
  return directory
}

describe("jsonc parsing", () => {
  test("#given comments and trailing commas #when stripped #then plain JSON parses", () => {
    const text = `{
      // line comment
      "dsh": {
        "keywords": ["shipit"], /* block comment */
      },
    }`
    expect(JSON.parse(stripJsonc(text))).toEqual({ dsh: { keywords: ["shipit"] } })
  })

  test("#given comment-like text inside a string #when stripped #then it survives", () => {
    const text = '{"url":"https://example.com/a//b","note":"// not a comment"}'
    expect(JSON.parse(stripJsonc(text))).toEqual({ url: "https://example.com/a//b", note: "// not a comment" })
  })

  test("#given broken JSON #when parsed #then an empty object is returned", () => {
    expect(parseConfigText("{ not json")).toEqual({})
  })
})

describe("config file reading", () => {
  test("#given a dsh block #when read #then only known keys from that block are returned", () => {
    const directory = createProject({ "omo.json": '{"dsh":{"keywords":["shipit"],"extra":true},"opencode":{"x":1}}' })
    expect(readConfigFile(join(directory, ".omo", "omo.json"))).toEqual({ keywords: ["shipit"] })
  })

  test("#given no dsh block #when read #then top-level keys are ignored", () => {
    const directory = createProject({ "omo.jsonc": '{"modes":{"team":false}}' })
    expect(readConfigFile(join(directory, ".omo", "omo.jsonc"))).toEqual({})
  })

  test("#given a missing file #when read #then undefined is returned", () => {
    expect(readConfigFile("/nonexistent/.omo/omo.json")).toBeUndefined()
  })
})

describe("layer discovery", () => {
  test("#given nested project directories #when collected #then the nearest file comes last", () => {
    const root = createProject({ "omo.json": '{"keywords":["root"]}' })
    mkdirSync(join(root, "deep", ".omo"), { recursive: true })
    writeFileSync(join(root, "deep", ".omo", "omo.json"), '{"keywords":["deep"]}')
    const files = configFilesFor(join(root, "deep"))
    const rootIndex = files.indexOf(join(root, ".omo", "omo.json"))
    const deepIndex = files.indexOf(join(root, "deep", ".omo", "omo.json"))
    expect(rootIndex).toBeGreaterThanOrEqual(0)
    expect(deepIndex).toBeGreaterThan(rootIndex)
    expect(files.at(-1)).toContain(join(root, "deep", ".omo"))
  })
})

describe("layer merging", () => {
  test("#given user then project then row #when merged #then the row wins and objects merge", () => {
    const merged = mergeConfigLayers(
      [{ keywords: ["user"], modes: { team: false, hyperplan: true } }, { keywords: ["project"] }],
      { modes: { team: true } },
    )
    expect(merged.keywords).toEqual(["project"])
    expect(merged.modes).toEqual({ team: true, hyperplan: true })
  })

  test("#given a project config #when loaded #then it is merged over the row defaults", () => {
    const directory = createProject({ "omo.json": '{"dsh":{"keywords":["shipit"]}}' })
    expect(loadMergedConfig(directory, {})).toEqual({ keywords: ["shipit"] })
    expect(loadMergedConfig(directory, { keywords: ["yolo"] })).toEqual({ keywords: ["yolo"] })
  })
})
