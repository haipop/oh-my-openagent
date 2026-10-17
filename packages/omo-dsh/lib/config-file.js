/**
 * Reads the shared OmO config file (`omo.json` / `omo.jsonc`) for DSH runtime
 * defaults.
 *
 * OmO's config lives in one file per layer: `<project>/.omo/omo.json[c]` for
 * project layers and `~/.omo/omo.json[c]` for the user layer, with the nearest
 * project layer winning. The Harness bundle row config stays authoritative: this
 * module only fills the keys the row left unset, so a profile stays in control.
 *
 * The file is JSONC (comments and trailing commas allowed). Parsing it here
 * keeps the adapter dependency-free.
 *
 * Limits are deliberate: the file can shape keyword modes, rule loading, and the
 * comment check. It cannot change which skills are registered, because runtime
 * skills are published once at activation.
 *
 * @module @oh-my-opencode/omo-dsh/config-file
 */

import { readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"

/** Config keys the adapter reads from the shared file. */
export const CONFIG_FILE_KEYS = Object.freeze(["enabled", "keywords", "applyToSubagents", "modes", "skills", "rules", "commentChecker"])

/** File names checked inside an `.omo` directory, in precedence order. */
export const CONFIG_FILE_NAMES = Object.freeze(["omo.json", "omo.jsonc"])

/**
 * Remove JSONC comments and trailing commas without touching string contents.
 *
 * @param {string} text - raw file contents.
 * @returns {string} plain JSON text.
 */
export function stripJsonc(text) {
  let out = ""
  let index = 0
  let inString = false
  let escaped = false
  while (index < text.length) {
    const char = text[index]
    const next = text[index + 1]
    if (inString) {
      out += char
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      index += 1
      continue
    }
    if (char === '"') {
      inString = true
      out += char
      index += 1
      continue
    }
    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1
      continue
    }
    if (char === "/" && next === "*") {
      index += 2
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index += 1
      index += 2
      continue
    }
    out += char
    index += 1
  }
  return out.replace(/,(\s*[}\]])/gu, "$1")
}

/**
 * Parse one OmO config file body.
 *
 * @param {string} text - raw JSONC text.
 * @returns {Record<string, unknown>} parsed object, or an empty object when the file is not an object.
 */
export function parseConfigText(text) {
  let parsed
  try {
    parsed = JSON.parse(stripJsonc(text))
  } catch {
    return {}
  }
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
}

/**
 * Read the adapter-relevant part of one config file.
 *
 * Only the `dsh` block is read: the same file carries configuration for other
 * harnesses, and a top-level key with the same name (for example `modes` or
 * `skills` in a future schema) must not silently change DSH behavior.
 *
 * @param {string} file - absolute path to `omo.json` or `omo.jsonc`.
 * @returns {Record<string, unknown> | undefined} known keys only, or undefined when the file is absent or unreadable.
 */
export function readConfigFile(file) {
  let text
  try {
    if (!statSync(file).isFile()) return undefined
    text = readFileSync(file, "utf8")
  } catch {
    return undefined
  }
  const parsed = parseConfigText(text)
  const source = parsed.dsh !== null && typeof parsed.dsh === "object" && !Array.isArray(parsed.dsh) ? parsed.dsh : {}
  const result = {}
  for (const key of CONFIG_FILE_KEYS) {
    if (source[key] !== undefined) result[key] = source[key]
  }
  return result
}

/**
 * Collect the config files that apply to one session directory, nearest last.
 *
 * Walks from the session directory upward, stopping before `$HOME` (there `.omo`
 * is the OmO home, not a project layer), then appends the user layer.
 *
 * @param {string} cwd - session working directory.
 * @returns {string[]} config file paths in merge order.
 */
export function configFilesFor(cwd) {
  const home = resolve(homedir())
  const files = []
  let directory = resolve(cwd)
  const seen = new Set()
  while (true) {
    if (directory === home) break
    for (const name of CONFIG_FILE_NAMES) {
      const file = join(directory, ".omo", name)
      if (!seen.has(file)) seen.add(file)
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  const projectChain = [...seen].reverse()
  const projectFiles = projectChain.filter((file) => configFileExists(file))
  const userFiles = []
  for (const name of CONFIG_FILE_NAMES) {
    const file = join(home, ".omo", name)
    if (configFileExists(file)) {
      userFiles.push(file)
      break
    }
  }
  return [...userFiles, ...projectFiles]
}

function configFileExists(file) {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

/**
 * Deep-merge the file layers, then apply the row config on top.
 *
 * Objects merge key by key; scalars and arrays replace. The row config wins for
 * every key it sets.
 *
 * @param {ReadonlyArray<Record<string, unknown>>} fileLayers - file configs from user to nearest project.
 * @param {Record<string, unknown>} rowConfig - the plugin row config.
 * @returns {Record<string, unknown>} merged raw config.
 */
export function mergeConfigLayers(fileLayers, rowConfig) {
  const merged = {}
  for (const layer of fileLayers) mergeInto(merged, layer)
  mergeInto(merged, rowConfig)
  return merged
}

function mergeInto(target, layer) {
  for (const [key, value] of Object.entries(layer)) {
    const current = target[key]
    if (isPlainObject(current) && isPlainObject(value)) {
      target[key] = { ...current, ...value }
    } else if (isPlainObject(value)) {
      target[key] = { ...value }
    } else {
      target[key] = value
    }
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/**
 * Load the merged raw config for one session directory.
 *
 * @param {string} cwd - session working directory.
 * @param {Record<string, unknown>} rowConfig - plugin row config.
 * @returns {Record<string, unknown>} merged raw config, row winning.
 */
export function loadMergedConfig(cwd, rowConfig) {
  const layers = []
  for (const file of configFilesFor(cwd)) {
    const layer = readConfigFile(file)
    if (layer === undefined) continue
    layers.push(layer)
  }
  return mergeConfigLayers(layers, rowConfig)
}
