import { describe, expect, test } from "bun:test"

import { DOC_SOURCES } from "./docs-content.generated"
import { headingId, splitDocSections } from "./docs-page"
import { DOC_GUIDE_PAGES } from "./docs-sections"

test("the generated install guides lead to the fork and do not offer standalone commands", () => {
  const guide = DOC_SOURCES["guide/install.md"] ?? ""
  const section = DOC_SOURCES["guide/installation.md"] ?? ""
  expect(guide).toContain('href="https://github.com/haipop/oh-my-openagent/blob/feat/deepseek-harness/README.md"')
  expect(section).toContain('href="/docs/install"')
  expect(`${guide}\n${section}`).not.toMatch(/get\.omo\.dev\/install\.(?:sh|ps1)|omo-ai|install-tabs/)
})

describe("splitDocSections", () => {
  for (const guide of DOC_GUIDE_PAGES) {
    test(`splits ${guide.file} into a titled lead and unique h2 sections`, () => {
      const page = splitDocSections(DOC_SOURCES[guide.file] ?? "")

      expect(page.lead).toContain(`<h1>${guide.title}</h1>`)
      expect(page.lead).not.toContain("<h2>")
      expect(page.sections.length).toBeGreaterThan(0)
      const ids = page.sections.map((section) => section.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const section of page.sections) expect(section.html.startsWith("<h2>")).toBe(true)
    })
  }

  test("links between guide pages resolve to their site routes", () => {
    expect(DOC_SOURCES["guide/agents.md"]).toContain('href="/docs/workflows"')
    expect(DOC_SOURCES["guide/workflows.md"]).toContain('href="/docs/keywords"')
  })
})

describe("headingId", () => {
  test("matches GitHub's anchors, so in-page links work on both", () => {
    expect(headingId("Fix your PATH")).toBe("fix-your-path")
    expect(headingId("Install with npm or Bun instead")).toBe("install-with-npm-or-bun-instead")
    expect(headingId("Behind a proxy, or offline?")).toBe("behind-a-proxy-or-offline")
  })
})
