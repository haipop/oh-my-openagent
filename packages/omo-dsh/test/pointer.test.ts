import { describe, expect, test } from "bun:test"

import {
  ULTRAWORK_POINTER_MARKER,
  ULTRAWORK_SOURCE_KIND,
  buildUltraworkPointer,
  createUltraworkMessage,
  isUltraworkMessage,
} from "../lib/pointer.js"

describe("ultrawork bootstrap pointer", () => {
  test("#given the pointer #when rendered #then it carries the mode marker and the three bootstrap steps", () => {
    const pointer = buildUltraworkPointer()
    expect(pointer.startsWith(ULTRAWORK_POINTER_MARKER)).toBe(true)
    expect(pointer.trimEnd().endsWith("</ultrawork-mode>")).toBe(true)
    expect(pointer).toContain("ULTRAWORK MODE ENABLED!")
    expect(pointer).toContain("get_goal")
    expect(pointer).toContain("create_goal")
    expect(pointer).toContain("`skill`")
    expect(pointer).toContain('name: "ultrawork"')
  })
})

describe("injected ultrawork message", () => {
  test("#given an identity and pointer #when the message is built #then it is a frozen sourced user message", () => {
    const message = createUltraworkMessage({ id: "message-1", pointer: "pointer text" })
    expect(message.id).toBe("message-1")
    expect(message.role).toBe("user")
    expect(message.source.kind).toBe(ULTRAWORK_SOURCE_KIND)
    expect(message.source.form).toBe("notice")
    expect(message.content).toEqual([{ type: "text", text: "pointer text" }])
    expect(Object.isFrozen(message)).toBe(true)
    expect(Object.isFrozen(message.content)).toBe(true)
    expect(Object.isFrozen(message.source)).toBe(true)
  })

  test("#given messages #when the injection is recognized #then only this plugin's source kind matches", () => {
    expect(isUltraworkMessage(createUltraworkMessage({ id: "message-1", pointer: "p" }))).toBe(true)
    expect(isUltraworkMessage({ source: { kind: "user" } })).toBe(false)
    expect(isUltraworkMessage({})).toBe(false)
  })
})
