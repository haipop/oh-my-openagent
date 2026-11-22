import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"

const REPO_ROOT = join(import.meta.dir, "..")

const ULW_LOOP_SKILL_ROOT = join(REPO_ROOT, "packages", "omo-codex", "plugin", "components", "ulw-loop", "skills", "ulw-loop")

describe("ulw-loop define-goal reference", () => {
  test(`#given the ulw-loop skill at ${ULW_LOOP_SKILL_ROOT} #when checking its references #then define-goal.md ships beside full-workflow.md`, () => {
    // given
    const referencePath = join(ULW_LOOP_SKILL_ROOT, "references", "define-goal.md")

    // then
    expect(existsSync(referencePath)).toBe(true)
  })
})
