import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

import { SKILL_LIBRARY, SKILL_LIBRARY_NAMES, loadLibrarySkills } from "../lib/library.js"
import { loadSkillFromFile } from "../lib/skill.js"

const skillsRoot = new URL("../skills/", import.meta.url)

describe("skill library", () => {
  test("#given the registry #when loaded #then every entry has a namespaced unique name and a shipped body", () => {
    const skills = loadLibrarySkills()
    expect(skills).toHaveLength(SKILL_LIBRARY.length)
    expect(new Set(SKILL_LIBRARY_NAMES).size).toBe(SKILL_LIBRARY_NAMES.length)
    expect(new Set(SKILL_LIBRARY.map((entry) => entry.id)).size).toBe(SKILL_LIBRARY.length)
    for (const [index, skill] of skills.entries()) {
      const entry = SKILL_LIBRARY[index]
      expect(skill.name.startsWith("omo-")).toBe(true)
      expect(skill.name).toBe(entry.name)
      expect(skill.source).toBe("runtime")
      expect(skill.description.length).toBeGreaterThan(0)
      expect(skill.whenToUse.length).toBeGreaterThan(0)
      expect(skill.content.length).toBeGreaterThan(0)
      expect(skill.content).toBe(readFileSync(new URL(entry.file, skillsRoot), "utf8").trim())
      expect(Object.isFrozen(skill)).toBe(true)
    }
  })

  test("#given a missing skill body #when loaded #then the loader fails loudly", () => {
    expect(() =>
      loadSkillFromFile({
        name: "omo-missing",
        file: "does-not-exist.md",
        description: "missing",
        whenToUse: "never",
      }),
    ).toThrow(/ENOENT/)
  })
})
