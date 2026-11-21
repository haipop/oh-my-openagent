import { describe, expect, test } from "bun:test"
import type { SessionContext, SessionPrompt } from "@opencode/plugin/promise/session"
import { unsafeTestValue } from "../../../../test-support/unsafe-test-value"
import {
  CONTEXT_METADATA_KEY,
  isUltraworkPrompt,
  latestAdmittedUserMode,
  markAdmittedPrompt,
  parsePromptModeMetadata,
  PROMPT_METADATA_KEY,
} from "./session-mode"
import { injectUltraworkContext } from "./ultrawork-context"

function prompt(text: string, metadata?: Record<string, unknown>): SessionPrompt {
  return unsafeTestValue<SessionPrompt>({ prompt: { text }, metadata })
}

describe("OpenCode V2 session mode", () => {
  test("detects bare and prefixed ultrawork prompts without changing prompt text", () => {
    expect(isUltraworkPrompt("please use ULW now")).toBe(true)
    expect(isUltraworkPrompt("run ultrawork on this repo")).toBe(true)
    expect(isUltraworkPrompt("run ulw-plan and ulw-loop")).toBe(false)
    expect(isUltraworkPrompt("the word is `ulw`")).toBe(false)
    expect(isUltraworkPrompt("```txt\nulw\n```")).toBe(false)
    expect(isUltraworkPrompt("ordinary implementation request")).toBe(false)
  })

  test("adds namespaced metadata to an admitted prompt while preserving existing values", () => {
    const event = prompt("please ulw inspect", { unrelated: "keep", [PROMPT_METADATA_KEY]: { stale: true } })

    markAdmittedPrompt(event)

    expect(event.prompt.text).toBe("please ulw inspect")
    expect(event.metadata?.unrelated).toBe("keep")
    expect(event.metadata?.[PROMPT_METADATA_KEY]).toEqual({
      source: "opencode-v2",
      version: 1,
      mode: "ultrawork",
    })
  })

  test("marks ordinary prompts standard", () => {
    const event = prompt("fix the failing test")

    markAdmittedPrompt(event)

    expect(event.metadata?.[PROMPT_METADATA_KEY]).toEqual({
      source: "opencode-v2",
      version: 1,
      mode: "standard",
    })
  })

  test("rejects malformed metadata instead of inferring mode", () => {
    expect(parsePromptModeMetadata(undefined)).toBeUndefined()
    expect(parsePromptModeMetadata("ultrawork")).toBeUndefined()
    expect(parsePromptModeMetadata({ source: "other", version: 1, mode: "ultrawork" })).toBeUndefined()
    expect(parsePromptModeMetadata({ source: "opencode-v2", version: 2, mode: "ultrawork" })).toBeUndefined()
    expect(parsePromptModeMetadata({ source: "opencode-v2", version: 1, mode: "team" })).toBeUndefined()
  })

  test("uses only the latest admitted user message", () => {
    const messages = [
      { role: "user", metadata: { [PROMPT_METADATA_KEY]: { source: "opencode-v2", version: 1, mode: "ultrawork" } } },
      {
        role: "assistant",
        metadata: { [PROMPT_METADATA_KEY]: { source: "opencode-v2", version: 1, mode: "ultrawork" } },
      },
      { role: "user", metadata: { [PROMPT_METADATA_KEY]: { source: "opencode-v2", version: 1, mode: "standard" } } },
    ]

    expect(latestAdmittedUserMode(messages)).toBe("standard")
  })

  test("injects once for Sisyphus and does not inject for another agent", () => {
    const ultraworkUser = {
      role: "user",
      metadata: { [PROMPT_METADATA_KEY]: { source: "opencode-v2", version: 1, mode: "ultrawork" } },
    }
    const system: Array<{ type?: unknown; metadata?: Record<string, unknown> }> = []
    const request = {
      agent: "sisyphus",
      messages: [ultraworkUser],
      system,
      model: unsafeTestValue("test-model"),
      options: {},
      tools: {},
      sessionID: unsafeTestValue("session-test"),
    }

    expect(injectUltraworkContext(unsafeTestValue<SessionContext>(request))).toBe(true)
    expect(injectUltraworkContext(unsafeTestValue<SessionContext>(request))).toBe(false)
    expect(system).toHaveLength(1)
    expect(system[0]?.metadata?.[CONTEXT_METADATA_KEY]).toBe(true)

    const otherAgentRequest = { ...request, agent: "build", system: [] }
    expect(injectUltraworkContext(unsafeTestValue<SessionContext>(otherAgentRequest))).toBe(false)
  })

  test("reads the latest admitted user from both request and stored-message shapes", () => {
    const requestMessages = [
      { role: "user", metadata: { [PROMPT_METADATA_KEY]: { source: "opencode-v2", version: 1, mode: "ultrawork" } } },
      { role: "assistant", metadata: {} },
    ]
    const storedMessages = [
      { type: "user", metadata: { [PROMPT_METADATA_KEY]: { source: "opencode-v2", version: 1, mode: "ultrawork" } } },
      { type: "assistant", metadata: {} },
      { type: "user", metadata: { [PROMPT_METADATA_KEY]: { source: "opencode-v2", version: 1, mode: "standard" } } },
    ]

    expect(latestAdmittedUserMode(requestMessages)).toBe("ultrawork")
    expect(latestAdmittedUserMode(storedMessages)).toBe("standard")
  })
})
