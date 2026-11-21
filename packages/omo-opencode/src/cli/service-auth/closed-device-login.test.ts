import { expect, onTestFinished, test } from "bun:test"
import { mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { fakeApi, grant, minted, temporaryHome } from "./test-support"

// #12639: while accounts are closed, the device-code sign-in (`login --device`, `login --no-browser`) is the one terminal
// sign-in a computer with no browser or desktop app has. The OpenCode CLI runs the device flow end to end. Every
// other closed service-account argv keeps refusing (accounts-closed.test.ts).
const cli = resolve(import.meta.dir, "../index.ts")
// #12639: `login --device` and `login --no-browser` run the device flow while closed. #13265: bare `login` joins
// them (and `login --`, which parses to the same options and leftover), so a computer with no desktop sign-in signs
// in from the terminal; the attach refusal (#13096) answers a machine that already has its sign-in.
const deviceLogins = [["login", "--device"], ["login", "--no-browser"], ["login"], ["login", "--"]] as const

async function run(entry: string, args: readonly string[], extraEnv: Record<string, string> = {}) {
  const home = await temporaryHome()
  // A3 (#13265) + the LEAD's isolation rule: fresh env (no inherited session bus), the child's own runtime dir.
  const runtimeDir = join(home, "xdg-run")
  mkdirSync(runtimeDir, { recursive: true })
  const paths: string[] = []
  const api = fakeApi((request) => {
    const path = new URL(request.url).pathname
    paths.push(path)
    if (path === "/v1/health") return Response.json({ ok: true })
    if (path === "/v1/device/code")
      return Response.json({ ...minted, expiresAt: new Date(Date.now() + 300_000).toISOString(), intervalSeconds: 1 })
    if (path === "/v1/device/token") {
      return Response.json(
        { error: { code: "access_denied", message: "denied", retryable: false, requestId: "r" } },
        { status: 400 },
      )
    }
    return new Response("", { status: 404 })
  })
  const child = Bun.spawn(
    [process.execPath, "--preload", join(import.meta.dir, "closed-device-login.fixture.ts"), entry, ...args],
    {
      cwd: home,
      env: {
        PATH: process.env.PATH,
        HOME: home,
        USERPROFILE: home,
        XDG_RUNTIME_DIR: runtimeDir,
        OMO_RUNTIME: "bun",
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
        OMO_SERVICE_API_URL: api,
        OMO_SERVICE_ACCOUNTS_URL: api,
        // The child's own lock home: the test preload's account seam does not reach a child process (#12978).
        OMO_TEST_CREDENTIAL_LOCK_HOME: home,
        ...extraEnv,
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  onTestFinished(async () => {
    if (child.exitCode === null) child.kill()
    await child.exited
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout, stderr, code, paths }
}

{
  test.each(deviceLogins.map((args) => [args.join(" "), args] as const))(
    `#given accounts are closed #when the CLI runs omo %s #then it runs the device flow and stores nothing on a denial`,
    async (_argv, args) => {
      const result = await run(cli, args)
      expect(result.stdout).toContain(`User code: ${minted.userCode}`)
      expect(result.stdout).toContain(`Matching code: ${minted.matchingCode}`)
      expect(result.paths).toContain("/v1/device/code")
      expect(result.paths).toContain("/v1/device/token")
      expect(result.stderr).not.toContain("This form of omo login isn't available")
      expect(result.stderr).not.toContain("KEYSTORE_WRITE")
      expect(result.code).toBe(1)
    },
    60_000,
  )
}

// #13265: the machine-present case. A stored sign-in (the adopted credential a desktop app's sign-in leaves, C3) is
// refused before any request — the attach refusal's own text, not a route refusal (C10) — and nothing is stored.
test("#given accounts are closed and a sign-in is stored #when the CLI runs omo login #then it refuses before any request", async () => {
  const result = await run(cli, ["login"], { OMO_TEST_STORE: "seed" })
  expect(result.code).toBe(1)
  expect(result.stderr).toContain("already signed in")
  expect(result.stderr).toContain("Run omo logout first")
  expect(result.paths).toEqual([])
  expect(result.stderr).not.toContain("KEYSTORE_WRITE")
}, 60_000)

async function runLoginWithGrant(me: () => Response) {
  const home = await temporaryHome()
  const runtimeDir = join(home, "xdg-run")
  mkdirSync(runtimeDir, { recursive: true })
  const paths: string[] = []
  const api = fakeApi((request) => {
    const path = new URL(request.url).pathname
    paths.push(path)
    if (path === "/v1/health") return Response.json({ ok: true })
    if (path === "/v1/device/code")
      return Response.json({ ...minted, expiresAt: new Date(Date.now() + 300_000).toISOString(), intervalSeconds: 1 })
    if (path === "/v1/device/token") return Response.json(grant)
    if (path === "/v1/me") return me()
    return new Response("", { status: 404 })
  })
  const child = Bun.spawn(
    [process.execPath, "--preload", join(import.meta.dir, "closed-device-login.fixture.ts"), cli, "login"],
    {
      cwd: home,
      env: {
        PATH: process.env.PATH,
        HOME: home,
        USERPROFILE: home,
        XDG_RUNTIME_DIR: runtimeDir,
        OMO_RUNTIME: "bun",
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
        OMO_SERVICE_API_URL: api,
        OMO_SERVICE_ACCOUNTS_URL: api,
        OMO_TEST_CREDENTIAL_LOCK_HOME: home,
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  onTestFinished(async () => {
    if (child.exitCode === null) child.kill()
    await child.exited
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout, stderr, code, paths }
}

// C5: the success line names the account; when the account read fails it says so and points at omo whoami, exit 0.
test("#given accounts are closed #when a bare omo login is approved #then the success line names the account", async () => {
  const result = await runLoginWithGrant(() =>
    Response.json({ user: { email: "ykim@example.com" }, account: { id: "acc-1" } }),
  )
  expect(result.code).toBe(0)
  expect(result.stdout).toContain("User code: ")
  expect(result.stdout).toContain("Signed in to OmO as ykim@example.com.")
}, 60_000)

test("#given the account read fails after the grant #then the success line says so and points at omo whoami", async () => {
  const result = await runLoginWithGrant(() => new Response("", { status: 500 }))
  expect(result.code).toBe(0)
  expect(result.stdout).toContain("could not be read")
  expect(result.stdout).toContain("omo whoami")
}, 60_000)

// F3.3: a non-default API origin is printed before the codes, so a redirected sign-in is visible.
test("#given a non-default API origin #when the device codes print #then the origin is printed first", async () => {
  const result = await runLoginWithGrant(() => Response.json({ user: { email: "ykim@example.com" } }))
  expect(result.stdout.indexOf("OmO API:")).toBeGreaterThanOrEqual(0)
  expect(result.stdout.indexOf("OmO API:")).toBeLessThan(result.stdout.indexOf("User code:"))
}, 60_000)
