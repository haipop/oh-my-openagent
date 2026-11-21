import { expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { gunzipSync } from "node:zlib"

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))

async function run(cmd: string[], cwd: string): Promise<string> {
  const child = Bun.spawn({ cmd, cwd, stdout: "pipe", stderr: "pipe", timeout: 120_000 })
  // Drain both pipes while the child runs (npm pack --json alone is ~90 KB), but decide on the exit first:
  // on Windows `npm` is the npm.cmd wrapper, and the spawn timeout kills only that wrapper, while the node
  // process under it keeps the pipes open, so awaiting the streams after a timeout hangs to the test limit.
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text()
  const status = await child.exited
  if (child.signalCode !== null)
    throw new Error(`${cmd.join(" ")} was killed (${child.signalCode}) after its 120 s timeout`)
  // The same surviving process can hold the pipes after a failing npm.cmd exits on its own, so the
  // failure report waits for stderr only briefly instead of hanging to the test limit (#10672).
  if (status !== 0) throw new Error(`${cmd.join(" ")} exited ${status}\n${await settledWithin(stderr, 5_000)}`)
  return stdout
}

async function settledWithin(text: Promise<string>, ms: number): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<string>((resolve) => {
    timer = setTimeout(resolve, ms, "(stderr still open after exit; output withheld)")
  })
  try {
    return await Promise.race([text, late])
  } finally {
    clearTimeout(timer)
  }
}

it("packs and installs the Senpi plugin, then resolves its PostHog sidecar and receives one real event", async () => {
  const plugin = join(repoRoot, "packages/omo-senpi/plugin")
  expect(existsSync(join(plugin, "extensions/omo-telemetry-posthog.js"))).toBe(true)
  expect(existsSync(join(plugin, "extensions/omo-telemetry-otlp.js"))).toBe(true)
  const root = await mkdtemp(join(tmpdir(), "posthog-packed-"))
  const posted: unknown[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const bytes = new Uint8Array(await request.arrayBuffer())
      posted.push(
        JSON.parse(
          new TextDecoder().decode(request.headers.get("content-encoding") === "gzip" ? gunzipSync(bytes) : bytes),
        ),
      )
      return Response.json({ status: 1 })
    },
  })
  try {
    const packed = JSON.parse(
      await run(["npm", "pack", "--json", "--ignore-scripts", "--pack-destination", root], plugin),
    )
    const tarball = join(root, packed[0].filename)
    const installed = join(root, "installed")
    await mkdir(installed)
    await run(
      [
        "npm",
        "install",
        "--prefix",
        installed,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        tarball,
      ],
      root,
    )
    const extensionDir = join(installed, "node_modules/@code-yeongyu/omo-senpi/extensions")
    const manifest = JSON.parse(await readFile(join(extensionDir, "../package.json"), "utf8"))
    expect(manifest.imports["#omo-telemetry-posthog-runtime"]).toBe("./extensions/omo-telemetry-posthog.js")
    expect(manifest.imports["#omo-telemetry-otlp-runtime"]).toBe("./extensions/omo-telemetry-otlp.js")
    const probe = join(extensionDir, "posthog-packed-probe.mjs")
    await writeFile(
      probe,
      `
const { createDefaultPostHogTransport } = await import("#omo-telemetry-posthog-runtime")
const transport = createDefaultPostHogTransport("synthetic-local-only", {
  host: ${JSON.stringify(`http://127.0.0.1:${server.port}`)},
  disableGeoip: false, enableExceptionAutocapture: false, enableLocalEvaluation: false,
  strictLocalEvaluation: true, disableRemoteConfig: true, flushAt: 20, flushInterval: 0,
})
transport.capture({ distinctId: "synthetic", event: "packed_sidecar_probe", properties: { ordinal: 1 } })
await transport.shutdown()
console.log("PACKED_POSTHOG_EVENT_SENT=1")
const { createSenpiOtlpTransport } = await import("#omo-telemetry-otlp-runtime")
if (typeof createSenpiOtlpTransport !== "function") throw new Error("OTLP sidecar export missing")
console.log("PACKED_OTLP_MODULE_LOADED=1")
`,
    )
    const output = await run(["node", probe], root)
    // Then a real SDK loaded from the installed package sends exactly one original event.
    expect(output).toContain("PACKED_POSTHOG_EVENT_SENT=1")
    expect(output).toContain("PACKED_OTLP_MODULE_LOADED=1")
    expect(posted).toEqual([
      expect.objectContaining({
        batch: [
          expect.objectContaining({
            distinct_id: "synthetic",
            event: "packed_sidecar_probe",
            properties: expect.objectContaining({ ordinal: 1 }),
          }),
        ],
      }),
    ])
    console.log("PACKED_POSTHOG_EVENT_RECEIVED=1")
  } finally {
    await server.stop(true)
    await rm(root, { recursive: true, force: true })
  }
}, 240_000)
