import { describe, expect, test } from "bun:test"

import {
  buildKeywordPattern,
  findKeywordMessage,
  hasKeyword,
  isChildAgent,
  isUserAuthoredMessage,
  messageText,
  stripCodeSpans,
} from "../lib/detect.js"

function userMessage(text: string) {
  return {
    id: `message-${text.length}`,
    role: "user",
    source: { kind: "user" },
    content: [{ type: "text", text }],
  }
}

describe("ultrawork keyword detection", () => {
  const pattern = buildKeywordPattern(["ultrawork", "ulw"])

  test("#given a prompt containing ulw #when matched #then the mode is invoked", () => {
    expect(hasKeyword(userMessage("please ulw this migration").content[0].text, pattern)).toBe(true)
  })

  test("#given any casing #when matched #then the mode is invoked", () => {
    expect(hasKeyword("ULW: fix the parser", pattern)).toBe(true)
    expect(hasKeyword("UltraWork the repo", pattern)).toBe(true)
  })

  test("#given a skill name with a hyphen or underscore suffix #when matched #then the mode is not invoked", () => {
    expect(hasKeyword("run ulw-plan for me", pattern)).toBe(false)
    expect(hasKeyword("ulw-loop status", pattern)).toBe(false)
    expect(hasKeyword("ulw_research notes", pattern)).toBe(false)
  })

  test("#given the keyword inside code #when matched #then the mode is not invoked", () => {
    expect(hasKeyword("```\nulw\n```", pattern)).toBe(false)
    expect(hasKeyword("the literal `ultrawork` string", pattern)).toBe(false)
  })

  test("#given text with code and prose #when the code is stripped #then the prose keeps the keyword", () => {
    const stripped = stripCodeSpans("`ulw` is the alias; ulw also works")
    expect(stripped).toContain("ulw also works")
    expect(hasKeyword("Use it, do not type `ultrawork` in a fence:\n```sh\nultrawork\n```\nulw now", pattern)).toBe(true)
  })

  test("#given a custom keyword list #when matched #then only those keywords fire", () => {
    const custom = buildKeywordPattern(["yolo"])
    expect(hasKeyword("yolo this", custom)).toBe(true)
    expect(hasKeyword("ulw this", custom)).toBe(false)
  })
})

describe("message inspection", () => {
  test("#given mixed content blocks #when text is collected #then only text blocks are joined", () => {
    const message = {
      role: "user",
      content: [
        { type: "text", text: "first" },
        { type: "image" },
        { type: "text", text: "second" },
      ],
    }
    expect(messageText(message)).toBe("first\nsecond")
  })

  test("#given a human prompt #when authorship is checked #then only user-sourced user messages pass", () => {
    expect(isUserAuthoredMessage(userMessage("hi"))).toBe(true)
    expect(isUserAuthoredMessage({ role: "assistant", source: { kind: "model" }, content: [] })).toBe(false)
    expect(isUserAuthoredMessage({ role: "user", source: { kind: "agent-instructions" }, content: [] })).toBe(false)
  })

  test("#given a child agent #when checked #then subagent sessions are recognized", () => {
    expect(isChildAgent({ session: { header: { origin: "subagent" } } })).toBe(true)
    expect(isChildAgent({ session: { header: { parentSession: "session-parent" } } })).toBe(true)
    expect(isChildAgent({ session: { header: { delegationDepth: 2 } } })).toBe(true)
    expect(isChildAgent({ session: { header: {} } })).toBe(false)
    expect(isChildAgent({})).toBe(false)
  })

  test("#given several entering messages #when searched #then the first human match wins", () => {
    const pattern = buildKeywordPattern(["ulw"])
    const first = userMessage("plain")
    const second = userMessage("now ulw")
    expect(findKeywordMessage([first, second], pattern)).toBe(second)
    expect(findKeywordMessage([first], pattern)).toBeUndefined()
  })
})
