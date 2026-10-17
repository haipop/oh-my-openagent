import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { apply, inject, name } from "../index.js"

type StepHandler = (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>

type FakeState = {
  readonly registeredSkills: unknown[]
  readonly handlers: { event: string; handler: StepHandler; options: unknown }[]
  readonly warnings: string[]
}

function createFakeContext(services: { workingDirectory?: { ensure(agent: unknown): Promise<string> } } = {}): {
  ctx: unknown
  state: FakeState
} {
  const state: FakeState = { registeredSkills: [], handlers: [], warnings: [] }
  const ctx = {
    skills: {
      register(skill: unknown) {
        state.registeredSkills.push(skill)
        return () => {}
      },
    },
    on(event: string, handler: StepHandler, options?: unknown) {
      state.handlers.push({ event, handler, options })
    },
    logger: {
      warn(...args: unknown[]) {
        state.warnings.push(args.map((value) => String(value)).join(" "))
      },
    },
    ...(services.workingDirectory === undefined ? {} : { workingDirectory: services.workingDirectory }),
  }
  return { ctx, state }
}

function humanMessage(text: string) {
  return {
    id: `human-${text.length}`,
    role: "user",
    source: { kind: "user" },
    content: [{ type: "text", text }],
  }
}

function stepPayload(agent: unknown, messages: readonly unknown[]) {
  return { agent, messages, turn: 1, step: 1, signal: new AbortController().signal }
}

function rootAgent() {
  return { session: { header: {} } }
}

function childAgent() {
  return { session: { header: { origin: "subagent" } } }
}

async function runStep(state: FakeState, payload: unknown, decision: unknown) {
  const registered = state.handlers.find((handler) => handler.event === "agent/pre-step")
  if (registered === undefined) throw new Error("no agent/pre-step handler registered")
  return (await registered.handler(payload, async () => decision)) as Record<string, unknown>
}

async function runPostExecute(
  state: FakeState,
  exec: unknown,
  result: unknown,
  downstream: unknown,
) {
  const registered = state.handlers.find((handler) => handler.event === "tools/post-execute")
  if (registered === undefined) throw new Error("no tools/post-execute handler registered")
  return (await registered.handler(exec, result, async () => downstream)) as Record<string, unknown>
}

describe("bundle activation", () => {
  test("#given a host context #when applied #then it registers the mode and library skills plus one prepended step listener", () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})

    expect(name).toBe("omo-ultrawork")
    expect(inject).toEqual(["skills", "workingDirectory"])
    expect(state.registeredSkills).toHaveLength(17)
    expect(state.handlers).toHaveLength(2)
    expect(state.handlers.map((handler) => handler.event)).toEqual(["agent/pre-step", "tools/post-execute"])
    expect(state.handlers[0]?.options).toEqual({ prepend: true })
    expect(state.handlers[1]?.options).toBeUndefined()

    const skills = state.registeredSkills as {
      name: string
      description: string
      whenToUse: string
      source: string
      content: string
    }[]
    expect(skills.map((skill) => skill.name)).toEqual([
      "omo-ultrawork",
      "omo-hyperplan",
      "omo-git-master",
      "omo-debugging",
      "omo-remove-ai-slops",
      "omo-data-scientist",
      "omo-review-work",
      "omo-init-deep",
      "omo-ulw-plan",
      "omo-ulw-execute",
      "omo-ulw-research",
      "omo-programming",
      "omo-refactor",
      "omo-frontend",
      "omo-ast-grep",
      "omo-lsp-setup",
      "omo-coding-agent-sessions",
    ])
    const ultrawork = skills.find((skill) => skill.name === "omo-ultrawork")
    const hyperplan = skills.find((skill) => skill.name === "omo-hyperplan")
    expect(ultrawork?.source).toBe("runtime")
    expect(hyperplan?.source).toBe("runtime")
    expect(ultrawork?.description.length).toBeGreaterThan(0)
    expect(hyperplan?.description.length).toBeGreaterThan(0)
    expect(ultrawork?.whenToUse.length).toBeGreaterThan(0)
    expect(hyperplan?.whenToUse.length).toBeGreaterThan(0)
    expect(ultrawork?.content).toBe(readFileSync(new URL("../skills/ultrawork.md", import.meta.url), "utf8").trim())
    expect(hyperplan?.content).toBe(readFileSync(new URL("../skills/hyperplan.md", import.meta.url), "utf8").trim())
  })

  test("#given modes disabled #when applied #then only the remaining mode skills register", () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, { modes: { team: false, hyperplan: false, hyperplanUltrawork: false }, skills: { library: false } })
    const skills = state.registeredSkills as { name: string }[]
    expect(skills.map((skill) => skill.name)).toEqual(["omo-ultrawork"])
  })

  test("#given the library disabled #when applied #then only mode skills register", () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, { skills: { library: false } })
    const skills = state.registeredSkills as { name: string }[]
    expect(skills.map((skill) => skill.name)).toEqual(["omo-ultrawork", "omo-hyperplan"])
  })

  test("#given an unknown skills key #when applied #then activation fails loudly", () => {
    const { ctx } = createFakeContext()
    expect(() => apply(ctx, { skills: { extras: true } })).toThrow(/unknown config\.skills key/)
  })

  test("#given a non-boolean skills flag #when applied #then activation fails loudly", () => {
    const { ctx } = createFakeContext()
    expect(() => apply(ctx, { skills: { library: "yes" } })).toThrow(/skills\.library must be a boolean/)
  })

  test("#given an unknown modes key #when applied #then activation fails loudly", () => {
    const { ctx } = createFakeContext()
    expect(() => apply(ctx, { modes: { search: true } })).toThrow(/unknown config\.modes key/)
  })

  test("#given enabled false #when applied #then nothing is registered", () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, { enabled: false })
    expect(state.registeredSkills).toHaveLength(0)
    expect(state.handlers).toHaveLength(0)
  })

  test("#given an unknown config key #when applied #then activation fails loudly", () => {
    const { ctx } = createFakeContext()
    expect(() => apply(ctx, { keyword: "ulw" })).toThrow(/unknown config key/)
  })

  test("#given a non-boolean flag #when applied #then activation fails loudly", () => {
    const { ctx } = createFakeContext()
    expect(() => apply(ctx, { applyToSubagents: "yes" })).toThrow(/applyToSubagents must be a boolean/)
  })
})

describe("step injection", () => {
  test("#given a human prompt containing ulw #when the step enters #then one sourced message is appended after the human message", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const hosted = humanMessage("ulw fix the parser")
    const decision = { kind: "enter", messages: [hosted] }

    const result = await runStep(state, stepPayload(rootAgent(), [hosted]), decision)

    expect(result).not.toBe(decision)
    expect(result.kind).toBe("enter")
    const messages = result.messages as { source: { kind: string }; role: string; content: { text: string }[]; id: string }[]
    expect(messages).toHaveLength(2)
    expect(messages[0]).toBe(hosted)
    expect(messages[1]?.role).toBe("user")
    expect(messages[1]?.source.kind).toBe("omo-ultrawork")
    expect(messages[1]?.content[0]?.text).toContain("<ultrawork-mode>")
    expect(messages[1]?.content[0]?.text).toContain('name: "omo-ultrawork"')
    expect(typeof messages[1]?.id).toBe("string")
    expect(messages[1]?.id.length).toBeGreaterThan(0)
  })

  test("#given no keyword #when the step enters #then the decision is untouched", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const hosted = humanMessage("fix the parser")
    const decision = { kind: "enter", messages: [hosted] }
    expect(await runStep(state, stepPayload(rootAgent(), [hosted]), decision)).toBe(decision)
  })

  test("#given a rejected decision #when the listener returns #then the rejection passes through", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const decision = { kind: "reject" }
    expect(await runStep(state, stepPayload(rootAgent(), [humanMessage("ulw")]), decision)).toBe(decision)
  })

  test("#given a keyword inside code #when the step enters #then nothing is injected", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const hosted = humanMessage("```\nulw\n```")
    const decision = { kind: "enter", messages: [hosted] }
    expect(await runStep(state, stepPayload(rootAgent(), [hosted]), decision)).toBe(decision)
  })

  test("#given a non-human source #when the step enters #then nothing is injected", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const systemNote = {
      id: "instructions-1",
      role: "user",
      source: { kind: "agent-instructions" },
      content: [{ type: "text", text: "ulw mentioned by a workspace file" }],
    }
    const decision = { kind: "enter", messages: [systemNote] }
    expect(await runStep(state, stepPayload(rootAgent(), [systemNote]), decision)).toBe(decision)
  })

  test("#given a child session #when the step enters #then the mode stays silent", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const hosted = humanMessage("ulw from a delegated child")
    const decision = { kind: "enter", messages: [hosted] }
    expect(await runStep(state, stepPayload(childAgent(), [hosted]), decision)).toBe(decision)
  })

  test("#given applyToSubagents #when a child session enters #then the mode still injects", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, { applyToSubagents: true })
    const hosted = humanMessage("ulw from a delegated child")
    const decision = { kind: "enter", messages: [hosted] }
    const result = await runStep(state, stepPayload(childAgent(), [hosted]), decision)
    expect((result.messages as unknown[]).length).toBe(2)
  })

  test("#given an existing injection #when the step enters again #then it is not duplicated", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const hosted = humanMessage("ulw fix the parser")
    const first = await runStep(state, stepPayload(rootAgent(), [hosted]), { kind: "enter", messages: [hosted] })
    const firstMessages = first.messages as unknown[]
    const second = await runStep(state, stepPayload(rootAgent(), [hosted]), { kind: "enter", messages: firstMessages })
    expect(second.messages).toBe(firstMessages)
  })

  test("#given a decision that starts a request series #when it enters #then the marker survives the rewrite", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const hosted = humanMessage("ulw fix the parser")
    const decision = { kind: "enter", messages: [hosted], startsRequestSeries: true }
    const result = await runStep(state, stepPayload(rootAgent(), [hosted]), decision)
    expect(result.startsRequestSeries).toBe(true)
  })

  test("#given a custom keyword list #when applied #then only the configured keyword activates", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, { keywords: ["yolo"] })

    const yolo = humanMessage("yolo fix the parser")
    const yoloResult = await runStep(state, stepPayload(rootAgent(), [yolo]), { kind: "enter", messages: [yolo] })
    expect((yoloResult.messages as unknown[]).length).toBe(2)

    const ulw = humanMessage("ulw fix the parser")
    const ulwDecision = { kind: "enter", messages: [ulw] }
    expect(await runStep(state, stepPayload(rootAgent(), [ulw]), ulwDecision)).toBe(ulwDecision)
  })

  test("#given a retried step with the same claimed message #when it enters again #then no second pointer is appended", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const agent = rootAgent()
    const hosted = humanMessage("ulw fix the parser")

    const first = await runStep(state, stepPayload(agent, [hosted]), { kind: "enter", messages: [hosted] })
    expect((first.messages as unknown[]).length).toBe(2)

    const retried = { kind: "enter", messages: [hosted] }
    expect(await runStep(state, stepPayload(agent, [hosted]), retried)).toBe(retried)
  })

  test("#given a later prompt with a new message id #when it enters #then the mode injects again", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const agent = rootAgent()

    const first = humanMessage("ulw fix the parser")
    expect(((await runStep(state, stepPayload(agent, [first]), { kind: "enter", messages: [first] })).messages as unknown[]).length).toBe(2)

    const second = humanMessage("ulw the tests too")
    const secondDecision = { kind: "enter", messages: [second] }
    const secondResult = await runStep(state, stepPayload(agent, [second]), secondDecision)
    expect(secondResult).not.toBe(secondDecision)
    expect((secondResult.messages as unknown[]).length).toBe(2)
  })

  test("#given a negated mention #when the step enters #then nothing is injected", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const hosted = humanMessage("do not use ultrawork, just fix the parser")
    const decision = { kind: "enter", messages: [hosted] }
    expect(await runStep(state, stepPayload(rootAgent(), [hosted]), decision)).toBe(decision)
  })

  test("#given a URL containing the word #when the step enters #then nothing is injected", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const hosted = humanMessage("read https://example.com/ulw and report")
    const decision = { kind: "enter", messages: [hosted] }
    expect(await runStep(state, stepPayload(rootAgent(), [hosted]), decision)).toBe(decision)
  })

  test("#given a team-mode prompt #when the step enters #then the team pointer is injected", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const hosted = humanMessage("team mode: split this work across members")
    const result = await runStep(state, stepPayload(rootAgent(), [hosted]), { kind: "enter", messages: [hosted] })
    const messages = result.messages as { source: { kind: string }; content: { text: string }[] }[]
    expect(messages).toHaveLength(2)
    expect(messages[1]?.source.kind).toBe("omo-team")
    expect(messages[1]?.content[0]?.text).toContain("spawn_teammate")
    expect(messages[1]?.content[0]?.text).toContain("TEAM MODE ENABLED!")
  })

  test("#given a hyperplan prompt #when the step enters #then the hyperplan pointer is injected", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const hosted = humanMessage("hyperplan this migration")
    const result = await runStep(state, stepPayload(rootAgent(), [hosted]), { kind: "enter", messages: [hosted] })
    const messages = result.messages as { source: { kind: string }; content: { text: string }[] }[]
    expect(messages).toHaveLength(2)
    expect(messages[1]?.source.kind).toBe("omo-hyperplan")
    expect(messages[1]?.content[0]?.text).toContain('name: "omo-hyperplan"')
  })

  test("#given a C++ header name #when the step enters #then hyperplan does not arm", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const hosted = humanMessage("include the interface.hpp header")
    const decision = { kind: "enter", messages: [hosted] }
    expect(await runStep(state, stepPayload(rootAgent(), [hosted]), decision)).toBe(decision)
  })

  test("#given hyperplan and ultrawork together #when the step enters #then only the combined pointer is injected", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const hosted = humanMessage("hyperplan ultrawork the migration")
    const result = await runStep(state, stepPayload(rootAgent(), [hosted]), { kind: "enter", messages: [hosted] })
    const messages = result.messages as { source: { kind: string }; content: { text: string }[] }[]
    expect(messages).toHaveLength(2)
    expect(messages[1]?.source.kind).toBe("omo-hyperplan-ultrawork")
    const pointer = messages[1]?.content[0]?.text ?? ""
    expect(pointer).toContain("HYPERPLAN ULTRAWORK MODE ENABLED!")
    expect(pointer).toContain('name: "omo-hyperplan"')
    expect(pointer).toContain('name: "omo-ultrawork"')
  })

  test("#given team mode disabled #when the step enters #then nothing is injected", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, { modes: { team: false } })
    const hosted = humanMessage("team mode: split this work")
    const decision = { kind: "enter", messages: [hosted] }
    expect(await runStep(state, stepPayload(rootAgent(), [hosted]), decision)).toBe(decision)
  })
})

const tempDirectories: string[] = []

afterAll(() => {
  for (const directory of tempDirectories) rmSync(directory, { recursive: true, force: true })
})

describe("project rules", () => {
  function createRuleDirectory(files: Record<string, string>): string {
    const cwd = mkdtempSync(join(tmpdir(), "omo-dsh-plugin-rules-"))
    tempDirectories.push(cwd)
    const directory = join(cwd, ".omo", "rules")
    mkdirSync(directory, { recursive: true })
    for (const [name, content] of Object.entries(files)) writeFileSync(join(directory, name), content)
    return cwd
  }

  test("#given an always-on rule and a session directory #when the step enters #then the rule context is appended once", async () => {
    const cwd = createRuleDirectory({ "alpha.md": "---\ndescription: alpha\n---\n\n# Alpha\nStay careful.\n" })
    const { ctx, state } = createFakeContext({ workingDirectory: { ensure: async () => cwd } })
    apply(ctx, { rules: { roots: [".omo/rules"] } })

    const agent = rootAgent()
    const hosted = humanMessage("fix the parser")
    const first = await runStep(state, stepPayload(agent, [hosted]), { kind: "enter", messages: [hosted] })
    const messages = first.messages as { source: { kind: string }; content: { text: string }[] }[]
    expect(messages).toHaveLength(2)
    expect(messages[1]?.source.kind).toBe("omo-rules")
    expect(messages[1]?.content[0]?.text).toContain("Stay careful")

    const second = await runStep(state, stepPayload(agent, [hosted]), { kind: "enter", messages })
    expect(second.messages).toBe(messages)
  })

  test("#given a glob rule and a prompt naming a matching path #when the step enters #then the rule is injected", async () => {
    const cwd = createRuleDirectory({ "tests.md": '---\nglobs:\n  - "**/*.test.ts"\n---\n\nTest rule body.\n' })
    const { ctx, state } = createFakeContext({ workingDirectory: { ensure: async () => cwd } })
    apply(ctx, { rules: { roots: [".omo/rules"] } })

    const hosted = humanMessage("fix packages/x/src/a.test.ts")
    const result = await runStep(state, stepPayload(rootAgent(), [hosted]), { kind: "enter", messages: [hosted] })
    const messages = result.messages as { source: { kind: string }; content: { text: string }[] }[]
    expect(messages[1]?.source.kind).toBe("omo-rules")
    expect(messages[1]?.content[0]?.text).toContain("tests.md")
  })

  test("#given no working directory service #when the step enters #then rules are skipped quietly", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const hosted = humanMessage("fix the parser")
    const decision = { kind: "enter", messages: [hosted] }
    expect(await runStep(state, stepPayload(rootAgent(), [hosted]), decision)).toBe(decision)
  })

  test("#given rules disabled #when the step enters #then only mode injection can happen", async () => {
    const cwd = createRuleDirectory({ "alpha.md": "Alpha body\n" })
    const { ctx, state } = createFakeContext({ workingDirectory: { ensure: async () => cwd } })
    apply(ctx, { rules: { enabled: false } })
    const hosted = humanMessage("fix the parser")
    const decision = { kind: "enter", messages: [hosted] }
    expect(await runStep(state, stepPayload(rootAgent(), [hosted]), decision)).toBe(decision)
  })

  test("#given an unknown rules key #when applied #then activation fails loudly", () => {
    const { ctx } = createFakeContext()
    expect(() => apply(ctx, { rules: { extra: true } })).toThrow(/unknown config\.rules key/)
  })

  test("#given an invalid rule budget #when applied #then activation fails loudly", () => {
    const { ctx } = createFakeContext()
    expect(() => apply(ctx, { rules: { maxBytes: 10 } })).toThrow(/rules\.maxBytes/)
  })
})

describe("comment checker", () => {
  test("#given a write with a restating comment #when post-execute runs #then a warning context is attached", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const exec = { name: "write", arguments: { file_path: "src/a.ts", content: "// increment the counter\ncounter += 1\n" }, agent: rootAgent() }
    const result = await runPostExecute(state, exec, { isError: false }, { kind: "accept" })
    expect(result.kind).toBe("accept")
    const contexts = result.additionalContexts as { source: { kind: string }; content: { text: string }[] }[]
    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.source.kind).toBe("omo-comments")
    expect(contexts[0]?.content[0]?.text).toContain("line 1")
  })

  test("#given a comment that explains why #when post-execute runs #then the decision is untouched", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const exec = { name: "write", arguments: { file_path: "src/a.ts", content: "// Retries once because the backend drops idle connections.\n" }, agent: rootAgent() }
    const downstream = { kind: "accept" }
    expect(await runPostExecute(state, exec, { isError: false }, downstream)).toBe(downstream)
  })

  test("#given a failed tool result #when post-execute runs #then nothing is attached", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})
    const exec = { name: "write", arguments: { file_path: "src/a.ts", content: "// loop through rows\n" }, agent: rootAgent() }
    const downstream = { kind: "accept" }
    expect(await runPostExecute(state, exec, { isError: true }, downstream)).toBe(downstream)
  })

  test("#given the warning cap reached #when another slop write lands #then no further context is attached", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, { commentChecker: { maxWarnings: 1 } })
    const agent = rootAgent()
    const slop = { name: "write", arguments: { file_path: "src/a.ts", content: "// loop through rows\n" }, agent }
    await runPostExecute(state, slop, { isError: false }, { kind: "accept" })
    const downstream = { kind: "accept" }
    expect(await runPostExecute(state, slop, { isError: false }, downstream)).toBe(downstream)
  })

  test("#given the checker disabled #when a slop write lands #then nothing is attached", async () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, { commentChecker: { enabled: false } })
    const exec = { name: "write", arguments: { file_path: "src/a.ts", content: "// loop through rows\n" }, agent: rootAgent() }
    const downstream = { kind: "accept" }
    expect(await runPostExecute(state, exec, { isError: false }, downstream)).toBe(downstream)
  })

  test("#given an unknown commentChecker key #when applied #then activation fails loudly", () => {
    const { ctx } = createFakeContext()
    expect(() => apply(ctx, { commentChecker: { extra: true } })).toThrow(/unknown config\.commentChecker key/)
  })
})

describe("shared config file", () => {
  function createProjectConfig(document: string): string {
    const cwd = mkdtempSync(join(tmpdir(), "omo-dsh-plugin-config-"))
    tempDirectories.push(cwd)
    mkdirSync(join(cwd, ".omo"), { recursive: true })
    writeFileSync(join(cwd, ".omo", "omo.json"), document)
    return cwd
  }

  test("#given a file keyword #when the step enters #then that keyword arms ultrawork", async () => {
    const cwd = createProjectConfig('{"dsh":{"keywords":["shipit"]}}')
    const { ctx, state } = createFakeContext({ workingDirectory: { ensure: async () => cwd } })
    apply(ctx, {})

    const hosted = humanMessage("shipit the release")
    const result = await runStep(state, stepPayload(rootAgent(), [hosted]), { kind: "enter", messages: [hosted] })
    const messages = result.messages as { source: { kind: string } }[]
    expect(messages.map((message) => message.source.kind)).toEqual(["user", "omo-ultrawork"])
  })

  test("#given the row config overrides the file keywords #when the step enters #then only the row keyword arms", async () => {
    const cwd = createProjectConfig('{"dsh":{"keywords":["shipit"]}}')
    const { ctx, state } = createFakeContext({ workingDirectory: { ensure: async () => cwd } })
    apply(ctx, { keywords: ["yolo"] })

    const shipit = humanMessage("shipit the release")
    const shipitDecision = { kind: "enter", messages: [shipit] }
    expect(await runStep(state, stepPayload(rootAgent(), [shipit]), shipitDecision)).toBe(shipitDecision)

    const yolo = humanMessage("yolo the release")
    const yoloResult = await runStep(state, stepPayload(rootAgent(), [yolo]), { kind: "enter", messages: [yolo] })
    expect((yoloResult.messages as unknown[]).length).toBe(2)
  })

  test("#given a file that disables rules #when the step enters #then no rules context is injected", async () => {
    const cwd = createProjectConfig('{"dsh":{"rules":{"enabled":false}}}')
    mkdirSync(join(cwd, ".omo", "rules"), { recursive: true })
    writeFileSync(join(cwd, ".omo", "rules", "alpha.md"), "Always be careful.\n")
    const { ctx, state } = createFakeContext({ workingDirectory: { ensure: async () => cwd } })
    apply(ctx, {})

    const hosted = humanMessage("fix the parser")
    const decision = { kind: "enter", messages: [hosted] }
    expect(await runStep(state, stepPayload(rootAgent(), [hosted]), decision)).toBe(decision)
  })

  test("#given an invalid file value #when the step enters #then the row config still works", async () => {
    const cwd = createProjectConfig('{"dsh":{"keywords":[]}}')
    const { ctx, state } = createFakeContext({ workingDirectory: { ensure: async () => cwd } })
    apply(ctx, {})

    const hosted = humanMessage("ulw fix the parser")
    const result = await runStep(state, stepPayload(rootAgent(), [hosted]), { kind: "enter", messages: [hosted] })
    expect((result.messages as unknown[]).length).toBe(2)
  })
})
