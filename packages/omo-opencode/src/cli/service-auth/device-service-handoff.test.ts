import { afterEach, describe, expect, test } from "bun:test"
import { generateKeyPairSync } from "node:crypto"
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { deviceServiceEndpointPath } from "@oh-my-opencode/device-service-core"
import { markLocalOnlyProcess } from "@oh-my-opencode/device-service-core/local-only"
import { startFakeOwner, type FakeOwner } from "@oh-my-opencode/device-service-core/conformance/fake-owner"
import { defaultWorld } from "@oh-my-opencode/device-service-core/conformance/world"
import packageJson from "../../../../../package.json" with { type: "json" }
import type { Credentials } from "./protocol"
import { cliDeviceServiceHandoff } from "./device-service-handoff"

const owners: FakeOwner[] = []
const dirs: string[] = []

afterEach(async () => {
  const holder = globalThis as { [key: symbol]: { marked: boolean } | undefined }
  const mark = holder[Symbol.for("omo.local-only-process.v1")]
  if (mark !== undefined) mark.marked = false
  for (const owner of owners.splice(0)) await owner.stop()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function privateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "omo-service-auth-handoff-"))
  chmodSync(dir, 0o700)
  dirs.push(dir)
  return dir
}

const credential: Credentials = {
  accessToken: "access-1",
  accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  refreshToken: "refresh-1",
  accountId: "acct_42",
  device: { id: "dev-self", name: "This Mac" },
  signingPrivateKey: generateKeyPairSync("ed25519")
    .privateKey.export({ format: "der", type: "pkcs8" })
    .toString("base64"),
  sealingPrivateKey: generateKeyPairSync("x25519")
    .privateKey.export({ format: "der", type: "pkcs8" })
    .toString("base64"),
}

describe("the OpenCode CLI device service hand-off", () => {
  test("hands the in-memory account and keys while identifying the current CLI build", async () => {
    const stateDir = join(privateDir(), "device-service")
    mkdirSync(stateDir, { recursive: true, mode: 0o700 })
    const owner = await startFakeOwner({ stateDir, world: { ...defaultWorld(), service_version: "0.1.3" } })
    owners.push(owner)
    await cliDeviceServiceHandoff({
      api: "http://127.0.0.1:9",
      stateDir,
      fetch: async () => new Response("{}", { status: 404 }),
      log: () => {},
    }).adopt(credential)

    const clients = [...owner.state.conns].map((connection) => connection.client())
    expect(clients).toEqual([{ name: "omo", version: packageJson.version }])
    expect(owner.state.adoptRequests).toEqual([
      expect.objectContaining({
        account: credential.accountId,
        device: credential.device,
        signing_private_key: credential.signingPrivateKey,
      }),
    ])
  })

  test("keeps the local-only account read refusal at the migrated owner", async () => {
    const stateDir = join(privateDir(), "device-service")
    mkdirSync(stateDir, { recursive: true, mode: 0o700 })
    await Bun.write(deviceServiceEndpointPath(stateDir), "")
    let fetched = 0
    const lines: string[] = []
    markLocalOnlyProcess()

    await cliDeviceServiceHandoff({
      api: "http://127.0.0.1:9",
      stateDir,
      connect: async () => {
        throw new Error("not reached")
      },
      fetch: async () => {
        fetched += 1
        return new Response("{}", { status: 500 })
      },
      log: (line) => lines.push(line),
    }).adopt({ ...credential, accountId: undefined })

    expect(fetched).toBe(0)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain("omo-opencode/service-auth/device-service-handoff.ts accountOf")
    expect(lines[0]).toContain("local-only")
  })
})
