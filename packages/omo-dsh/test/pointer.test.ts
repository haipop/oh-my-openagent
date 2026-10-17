import { describe, expect, test } from "bun:test"

import {
  HYPERPLAN_SOURCE_KIND,
  HYPERPLAN_ULTRAWORK_SOURCE_KIND,
  TEAM_SOURCE_KIND,
  ULTRAWORK_POINTER_MARKER,
  ULTRAWORK_SOURCE_KIND,
  buildHyperplanPointer,
  buildHyperplanUltraworkPointer,
  buildTeamPointer,
  buildUltraworkPointer,
  createModeMessage,
  createUltraworkMessage,
  isModeMessage,
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
    expect(pointer).toContain('name: "omo-ultrawork"')
  })

  test("#given an explicit skill name #when the pointer is rendered #then it names that skill", () => {
    expect(buildUltraworkPointer({ skillName: "my-directive" })).toContain('name: "my-directive"')
  })
})

describe("team and hyperplan pointers", () => {
  test("#given the team pointer #when rendered #then it names the native Agent Teams tools", () => {
    const pointer = buildTeamPointer()
    expect(pointer.startsWith("<team-mode>")).toBe(true)
    expect(pointer).toContain("TEAM MODE ENABLED!")
    expect(pointer).toContain("spawn_teammate")
    expect(pointer).toContain("team_task_create")
    expect(pointer).toContain("wait_agent")
    expect(pointer).toContain("interrupt_agent")
  })

  test("#given the hyperplan pointer #when rendered #then it loads the directive skill", () => {
    const pointer = buildHyperplanPointer()
    expect(pointer.startsWith("<hyperplan-mode>")).toBe(true)
    expect(pointer).toContain("HYPERPLAN MODE ENABLED!")
    expect(pointer).toContain('name: "omo-hyperplan"')
  })

  test("#given the combined pointer #when rendered #then it orders planning before execution and suppresses single banners", () => {
    const pointer = buildHyperplanUltraworkPointer()
    expect(pointer.startsWith("<hyperplan-ultrawork-mode>")).toBe(true)
    expect(pointer).toContain("HYPERPLAN ULTRAWORK MODE ENABLED!")
    expect(pointer).toContain("do NOT also emit the standalone hyperplan or ultrawork banners")
    expect(pointer).toContain('name: "omo-hyperplan"')
    expect(pointer).toContain('name: "omo-ultrawork"')
    expect(pointer.indexOf("omo-hyperplan")).toBeLessThan(pointer.indexOf("omo-ultrawork"))
  })
})

describe("injected mode messages", () => {
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

  test("#given each mode kind #when the message is built #then the source kind and summary are mode specific", () => {
    const team = createModeMessage({ id: "m1", pointer: "p", kind: TEAM_SOURCE_KIND, summary: "team mode activated" })
    const hyper = createModeMessage({ id: "m2", pointer: "p", kind: HYPERPLAN_SOURCE_KIND, summary: "hyperplan mode activated" })
    const combo = createModeMessage({
      id: "m3",
      pointer: "p",
      kind: HYPERPLAN_ULTRAWORK_SOURCE_KIND,
      summary: "hyperplan ultrawork mode activated",
    })
    expect(team.source).toEqual({ kind: "omo-team", form: "notice", summary: "team mode activated" })
    expect(hyper.source.kind).toBe("omo-hyperplan")
    expect(combo.source.kind).toBe("omo-hyperplan-ultrawork")
  })

  test("#given messages #when the injection is recognized #then every bundle kind matches and other kinds do not", () => {
    expect(isUltraworkMessage(createUltraworkMessage({ id: "message-1", pointer: "p" }))).toBe(true)
    expect(isModeMessage(createModeMessage({ id: "m", pointer: "p", kind: TEAM_SOURCE_KIND, summary: "s" }))).toBe(true)
    expect(isModeMessage(createModeMessage({ id: "m", pointer: "p", kind: HYPERPLAN_SOURCE_KIND, summary: "s" }))).toBe(true)
    expect(isModeMessage({ source: { kind: "user" } })).toBe(false)
    expect(isModeMessage({})).toBe(false)
  })
})
