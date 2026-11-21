import { z } from "zod"

/** Isolates one machine-consumed workflow section for release integration tests. */
export function sliceWorkflowSection(workflow: string, startMarker: string, endMarker: string): string {
  const start = workflow.indexOf(startMarker)
  const end = workflow.indexOf(endMarker, start)
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`missing workflow section between ${startMarker} and ${endMarker}`)
  }
  return workflow.slice(start, end)
}

/** Returns the shell body GitHub Actions executes for a named multiline step. */
export function runBlock(workflow: string, startMarker: string, endMarker: string): string {
  const section = sliceWorkflowSection(workflow, startMarker, endMarker)
  const run = section.indexOf("        run: |\n")
  if (run < 0) throw new Error(`missing run block in ${startMarker}`)
  return section
    .slice(run + "        run: |\n".length)
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n")
}

export type DesktopEngineLeg = {
  readonly host: string
  readonly runner: string
  readonly rust_target: string
  readonly clang_arch?: string
  readonly binary: string
}

export function desktopEngineLegs(workflow: string): DesktopEngineLeg[] {
  const leg = z.object({
    host: z.string(),
    runner: z.string(),
    rust_target: z.string(),
    clang_arch: z.string().optional(),
    binary: z.string(),
  })
  const parsed = z
    .object({
      jobs: z.object({
        "desktop-engine": z.object({ strategy: z.object({ matrix: z.object({ include: z.array(leg) }) }) }),
      }),
    })
    .parse(Bun.YAML.parse(workflow))
  return parsed.jobs["desktop-engine"].strategy.matrix.include
}
