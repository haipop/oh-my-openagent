import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { SessionContext, SessionPrompt } from "@opencode/plugin/promise/session"
import { unsafeTestValue } from "../../../../test-support/unsafe-test-value"
import rootModule from "../index"
import { opencodeV2Server } from "./server-entry"
import { PROMPT_METADATA_KEY } from "./session-mode"

type Registration = { dispose: () => Promise<void> }
type SessionHookName = "prompt" | "context"
type PromptCallback = (event: SessionPrompt) => void
type ContextCallback = (event: SessionContext) => void

type Harness = {
  registrations: Registration[]
  operations: string[]
  promptCallbacks: PromptCallback[]
  contextCallbacks: ContextCallback[]
  toolHooks: Map<string, (event: unknown) => Promise<void>>
  tools: Map<string, { execute: (input: unknown, context: unknown) => Promise<unknown> }>
  storedMessages: Array<{ role?: unknown; type?: unknown; metadata?: unknown }>
}

async function setupPlugin(directory = process.cwd()): Promise<Harness> {
  const harness: Harness = {
    registrations: [],
    operations: [],
    promptCallbacks: [],
    contextCallbacks: [],
    toolHooks: new Map(),
    tools: new Map(),
    storedMessages: [],
  }
  const context = unsafeTestValue<Parameters<typeof opencodeV2Server.setup>[0]>({
    location: { directory },
    session: {
      get: async () => ({ location: { directory } }),
      context: async ({ sessionID }: { sessionID: string }) => {
        if (sessionID !== "server-session") throw new Error(`unexpected session read: ${sessionID}`)
        return harness.storedMessages
      },
      hook: async (_name: SessionHookName, callback: unknown) => {
        if (_name === "prompt") harness.promptCallbacks.push(callback as PromptCallback)
        if (_name === "context") harness.contextCallbacks.push(callback as ContextCallback)
        const registration = { dispose: async () => {} }
        harness.registrations.push(registration)
        return registration
      },
    },
    tool: {
      hook: async (name: string, callback: (event: unknown) => Promise<void>) => {
        harness.toolHooks.set(name, callback)
        const registration = { dispose: async () => {} }
        harness.registrations.push(registration)
        return registration
      },
      reload: async () => {
        harness.operations.push("tool.reload")
      },
      transform: async (callback: (editor: { add: (tool: unknown) => void }) => void) => {
        harness.operations.push("tool.transform")
        callback({
          add: (tool) => {
            const definition = tool as { name: string; execute: (input: unknown, context: unknown) => Promise<unknown> }
            harness.tools.set(definition.name, definition)
          },
        })
        const registration = { dispose: async () => {} }
        harness.registrations.push(registration)
        return registration
      },
    },
  })

  await opencodeV2Server.setup(context)
  return harness
}

function admittedPrompt(sessionID: string, text: string): SessionPrompt {
  return unsafeTestValue<SessionPrompt>({ sessionID, prompt: { text }, metadata: {} })
}

function requestFor(sessionID: string, mode: "standard" | "ultrawork"): SessionContext {
  return unsafeTestValue<SessionContext>({
    sessionID,
    agent: "sisyphus",
    system: [],
    messages: [{ role: "user", metadata: { [PROMPT_METADATA_KEY]: { source: "opencode-v2", version: 1, mode } } }],
  })
}

describe("OpenCode V2 server plugin", () => {
  test("registers prompt, context, and one read-only status tool without plugin-local mode state", async () => {
    const harness = await setupPlugin()

    expect(harness.promptCallbacks).toHaveLength(1)
    expect(harness.contextCallbacks).toHaveLength(1)
    expect([...harness.tools.keys()]).toEqual(["omo_status"])
    expect(harness.tools.get("omo_status")?.options).toEqual({ codemode: false })
    expect(harness.registrations).toHaveLength(5)
    expect(harness.operations).toEqual(["tool.transform", "tool.reload"])
    expect(harness.registrations.every((registration) => typeof registration.dispose === "function")).toBe(true)

    const promptEvent = admittedPrompt("server-session", "please ulw proceed")
    harness.promptCallbacks[0]?.(promptEvent)
    const contextEvent = requestFor("server-session", "ultrawork")
    harness.contextCallbacks[0]?.(contextEvent)
    expect(contextEvent.system).toHaveLength(1)

    harness.storedMessages.push({ type: "user", metadata: promptEvent.metadata })
    const result = await harness.tools.get("omo_status")?.execute({}, { sessionID: "server-session" })
    expect(result).toEqual({
      output: {
        sessionID: "server-session",
        mode: "ultrawork",
        capabilities: ["ulw-prompt-context", "omo_status"],
      },
      content: JSON.stringify({
        sessionID: "server-session",
        mode: "ultrawork",
        capabilities: ["ulw-prompt-context", "omo_status"],
      }),
    })

    harness.storedMessages.push({
      type: "user",
      metadata: { [PROMPT_METADATA_KEY]: { source: "opencode-v2", version: 1, mode: "standard" } },
    })
    const afterLaterTurn = await harness.tools.get("omo_status")?.execute({}, { sessionID: "server-session" })
    expect((afterLaterTurn as { output: { mode: string } }).output.mode).toBe("standard")
  })

  test("reflects each host read rather than retaining prompt-hook state", async () => {
    const first = await setupPlugin()
    const second = await setupPlugin()

    first.promptCallbacks[0]?.(admittedPrompt("first-session", "ulw"))
    second.promptCallbacks[0]?.(admittedPrompt("second-session", "ordinary"))

    const firstContext = requestFor("first-session", "ultrawork")
    const secondContext = requestFor("second-session", "standard")
    first.contextCallbacks[0]?.(firstContext)
    first.contextCallbacks[0]?.(firstContext)
    second.contextCallbacks[0]?.(secondContext)

    expect(firstContext.system).toHaveLength(1)
    expect(secondContext.system).toHaveLength(0)

    await expect(first.tools.get("omo_status")?.execute({}, { sessionID: "first-session" })).rejects.toThrow(
      "unexpected session read: first-session",
    )
    await expect(second.tools.get("omo_status")?.execute({}, { sessionID: "second-session" })).rejects.toThrow(
      "unexpected session read: second-session",
    )
  })

  test("root entry exposes only the V2 definition", () => {
    expect(rootModule).toBe(opencodeV2Server)
    expect(Object.keys(rootModule).sort()).toEqual(["id", "setup"])
    expect(Object.keys(rootModule)).not.toContain("server")
    expect(Object.keys(rootModule)).not.toContain("omoPlugin")
  })

  test("requires a completed native read to unlock the write and respects the disabled hook setting", async () => {
    const directory = mkdtempSync(join(tmpdir(), "omo-v2-write-guard-test-"))
    try {
      const path = "existing.txt"
      writeFileSync(join(directory, path), "original")
      const { toolHooks } = await setupPlugin(directory)
      const after = toolHooks.get("execute.after")
      const before = toolHooks.get("execute.before")
      if (!after || !before) throw new Error("Expected both write guard hooks")
      const read = { tool: "read", sessionID: "reader", input: { path } }
      const write = { tool: "write", sessionID: "reader", input: { path, content: "replacement" } }

      await after({ ...read, status: "error" })
      await expect(before(write)).rejects.toThrow("File already exists")
      await after({ ...read, status: "completed" })
      await before(write)
      await expect(before(write)).rejects.toThrow("File already exists")

      mkdirSync(join(directory, ".omo"))
      writeFileSync(
        join(directory, ".omo", "omo.json"),
        JSON.stringify({
          "[opencode]": { disabled_hooks: ["write-existing-file-guard"] },
        }),
      )
      const disabled = await setupPlugin(directory)
      expect(disabled.toolHooks.has("execute.before")).toBe(false)
      expect(disabled.toolHooks.has("execute.after")).toBe(false)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
