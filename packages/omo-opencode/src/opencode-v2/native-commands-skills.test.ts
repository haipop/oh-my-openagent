import { afterEach, describe, expect, test } from "bun:test"
import type { CommandDefinition } from "@opencode/plugin/promise/command"
import type { Context } from "@opencode/plugin/promise/plugin"
import { isAbsolute, join } from "node:path"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { unsafeTestValue } from "../../../../test-support/unsafe-test-value"
import type { OhMyOpenCodeConfig } from "../config"
import { registerNativeCommandsAndSkills } from "./native-commands-skills"

type Registration = { dispose: () => Promise<void> }
type PromptInput = Parameters<Context["session"]["prompt"]>[0]
type NativeSkill = {
  id: string
  name: string
  description?: string
  path: string
  content: string
}

type Harness = {
  commands: Map<string, CommandDefinition>
  operations: string[]
  prompts: PromptInput[]
  registrations: Registration[]
  skills: Map<string, NativeSkill>
}

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function createFixture(): { context: Context; harness: Harness } {
  const root = mkdtempSync(join(tmpdir(), "omo-v2-native-commands-skills-"))
  temporaryDirectories.push(root)
  const project = join(root, "project")
  mkdirSync(project, { recursive: true })

  const harness: Harness = {
    commands: new Map(),
    operations: [],
    prompts: [],
    registrations: [],
    skills: new Map(),
  }
  const registration = (): Registration => {
    const value = { dispose: async () => {} }
    harness.registrations.push(value)
    return value
  }
  const context = unsafeTestValue<Context>({
    location: { directory: project },
    command: {
      transform: async (callback: (editor: { add: (definition: CommandDefinition) => void }) => void) => {
        harness.operations.push("command.transform")
        callback({ add: (definition) => harness.commands.set(definition.name, definition) })
        return registration()
      },
      reload: async () => {
        harness.operations.push("command.reload")
      },
    },
    session: {
      prompt: async (input: PromptInput) => {
        harness.prompts.push(input)
        return unsafeTestValue({})
      },
    },
    skill: {
      transform: async (
        callback: (editor: {
          add: (skill: NativeSkill) => void
          get: (id: string) => NativeSkill | undefined
          list: () => NativeSkill[]
          remove: (id: string) => void
          update: (id: string, update: (skill: NativeSkill) => void) => void
        }) => void,
      ) => {
        harness.operations.push("skill.transform")
        callback({
          add: (skill) => harness.skills.set(skill.id, skill),
          get: (id) => harness.skills.get(id),
          list: () => [...harness.skills.values()],
          remove: (id) => {
            harness.skills.delete(id)
          },
          update: (id, update) => {
            const skill = harness.skills.get(id)
            if (skill) update(skill)
          },
        })
        return registration()
      },
      reload: async () => {
        harness.operations.push("skill.reload")
      },
    },
  })

  return { context, harness }
}

describe("OpenCode V2 native commands and skills", () => {
  test("#given enabled built-ins #when invoking a command #then its expanded prompt retains the input", async () => {
    const { context, harness } = createFixture()
    const config: OhMyOpenCodeConfig = { disabled_commands: [], disabled_skills: [] }

    await registerNativeCommandsAndSkills(context, config)

    expect(harness.commands.has("handoff")).toBe(true)
    expect(harness.commands.has("goal")).toBe(true)
    expect(harness.skills.has("debugging")).toBe(true)
    expect(harness.skills.has("init-deep")).toBe(true)
    expect(harness.operations).toEqual(["command.transform", "command.reload", "skill.transform", "skill.reload"])
    expect(harness.registrations).toHaveLength(2)

    const skill = harness.skills.get("debugging")
    expect(skill?.id).toBe(skill?.name)
    expect(skill?.content.length).toBeGreaterThan(0)
    expect(skill?.path ? isAbsolute(skill.path) : false).toBe(true)

    await harness.commands.get("handoff")?.execute({
      sessionID: "session-123",
      prompt: {
        text: "preserve these arguments",
        files: [{ uri: "file:///tmp/example.ts" }],
        skills: [{ id: "debugging" }],
      },
      delivery: "queue",
    })

    expect(harness.prompts).toHaveLength(1)
    expect(harness.prompts[0]).toMatchObject({
      sessionID: "session-123",
      delivery: "queue",
      files: [{ uri: "file:///tmp/example.ts" }],
      skills: [{ id: "debugging" }],
    })
    expect(harness.prompts[0]?.text).toContain("preserve these arguments")
    expect(harness.prompts[0]?.text).not.toContain("$ARGUMENTS")
    expect(harness.prompts[0]?.text).not.toContain("$SESSION_ID")
    expect(harness.prompts[0]?.text).not.toContain("$TIMESTAMP")
  })

  test("#given disabled names #when registering #then matching built-ins are omitted", async () => {
    const { context, harness } = createFixture()
    const config: OhMyOpenCodeConfig = {
      disabled_commands: ["handoff"],
      disabled_skills: ["DeBuGgInG", "unknown-skill"],
    }

    await registerNativeCommandsAndSkills(context, config)

    expect(harness.commands.has("handoff")).toBe(false)
    expect(harness.commands.has("goal")).toBe(true)
    expect(harness.skills.has("debugging")).toBe(false)
    expect(harness.skills.has("init-deep")).toBe(true)
  })
})
