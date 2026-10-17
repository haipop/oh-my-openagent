import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

import { apply, inject, name } from "../index.js"

type StepHandler = (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>

type FakeState = {
  readonly registeredSkills: unknown[]
  readonly handlers: { event: string; handler: StepHandler; options: unknown }[]
  readonly warnings: string[]
}

function createFakeContext(): { ctx: unknown; state: FakeState } {
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
  const registered = state.handlers[0]
  if (registered === undefined) throw new Error("no agent/pre-step handler registered")
  return (await registered.handler(payload, async () => decision)) as Record<string, unknown>
}

describe("bundle activation", () => {
  test("#given a host context #when applied #then it registers the runtime skill and one prepended step listener", () => {
    const { ctx, state } = createFakeContext()
    apply(ctx, {})

    expect(name).toBe("omo-ultrawork")
    expect(inject).toEqual(["skills"])
    expect(state.registeredSkills).toHaveLength(1)
    expect(state.handlers).toHaveLength(1)
    expect(state.handlers[0]?.event).toBe("agent/pre-step")
    expect(state.handlers[0]?.options).toEqual({ prepend: true })

    const skill = state.registeredSkills[0] as {
      name: string
      description: string
      whenToUse: string
      source: string
      content: string
    }
    expect(skill.name).toBe("omo-ultrawork")
    expect(skill.source).toBe("runtime")
    expect(skill.description.length).toBeGreaterThan(0)
    expect(skill.whenToUse.length).toBeGreaterThan(0)
    expect(skill.content).toBe(readFileSync(new URL("../skills/ultrawork.md", import.meta.url), "utf8").trim())
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
})
