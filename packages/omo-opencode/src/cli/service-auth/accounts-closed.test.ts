import { expect, onTestFinished, test } from "bun:test"
import { mkdirSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { Command } from "commander"
import { createMcpOAuthCommand } from "../mcp-oauth"
import { signInHint, signInRoute } from "./accounts-gate"
import { CLOSED_LOGIN_MESSAGE, configureServiceAuthCommands } from "./commands"
import { fakeApi, temporaryHome } from "./test-support"

const cli = resolve(import.meta.dir, "../index.ts")
// #12639: only these closed login forms still refuse, and the refusal names the terminal route (#13265).
const refusedInvocations = [
  ["login", "--accounts", "https://example.invalid"],
  ["login", "--api", "https://example.invalid"],
]

async function run(
  entry: string,
  args: readonly string[],
  extraEnv: Record<string, string> = {},
  fixture = "accounts-closed.fixture.ts",
) {
  const home = await temporaryHome()
  // A3 (#13265) and the LEAD's isolation rule: the env below is built fresh, so the parent's session bus is not
  // inherited, and the runtime dir is the child's own. Running cases pass the fake-store preload, because the
  // default fixture refuses every store access and the attach step reads the store before anything else.
  const runtimeDir = join(home, "xdg-run")
  mkdirSync(runtimeDir, { recursive: true })
  let requests = 0
  const api = fakeApi(() => {
    requests += 1
    return Response.json({ ok: true })
  })
  const child = Bun.spawn([process.execPath, "--preload", join(import.meta.dir, fixture), entry, ...args], {
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
  })
  onTestFinished(async () => {
    if (child.exitCode === null) child.kill()
    await child.exited
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  // Runtime probing may create .local/.cache/xdg-run under the temp HOME; a credential file would still surface here.
  const homeEntries = readdirSync(home).filter((name) => name !== ".local" && name !== ".cache" && name !== "xdg-run")
  return { stdout, stderr, code, requests, homeEntries }
}

test.each(refusedInvocations.map((args) => [args.join(" "), args] as const))(
  "#given accounts are closed #when the CLI runs omo %s #then it refuses with no request, keystore access or file",
  async (_argv, args) => {
    const result = await run(cli, args)
    expect({
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr.trim(),
      requests: result.requests,
      homeEntries: result.homeEntries,
    }).toEqual({ code: 1, stdout: "", stderr: CLOSED_LOGIN_MESSAGE, requests: 0, homeEntries: [] })
  },
  60_000,
)

// #13265: bare `omo login` reaches the device-code flow through the retained CLI owner. The fake API answers the
// health probe and the mint with a shape the flow cannot parse, proving the flow ran without asserting on a granting
// service here (closed-device-login.test.ts covers the granted flow).
test("#given accounts are closed #when the CLI runs omo login #then it reaches the device-code flow", async () => {
  const result = await run(cli, ["login"], {}, "closed-device-login.fixture.ts")
  expect(result.requests).toBeGreaterThan(0)
  expect(result.stderr).not.toContain(CLOSED_LOGIN_MESSAGE)
  expect(result.stderr).not.toContain("isn't available yet")
  expect(result.stderr).not.toContain("Cannot access Linux Secret Service")
}, 60_000)

test("#given accounts are closed #when the CLI runs omo login --help #then it describes the device-code route", async () => {
  const result = await run(cli, ["login", "--help"])
  expect(result.code).toBe(0)
  expect(result.stdout).toContain("--device")
  expect(result.stderr).not.toContain(CLOSED_LOGIN_MESSAGE)
}, 60_000)

// #13461: logout and whoami answer --help with their own closed-mode text, as login does, instead of the refusal.
test.each([
  ["logout", "Sign out of OmO"],
  ["whoami", "Show the current OmO device sign-in"],
])(
  "#given accounts are closed #when the CLI runs omo %s --help #then it prints that command's help",
  async (command, help) => {
    const result = await run(cli, [command, "--help"])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain(help)
    expect(result.stderr).not.toContain(CLOSED_LOGIN_MESSAGE)
    expect(result.requests).toBe(0)
  },
  60_000,
)

// C4: logout and whoami run while closed. On an empty store whoami says so with the hint; logout signs out (no
// device to revoke, so no request) and leaves the signed-out marker.
test("#given accounts are closed and no sign-in is stored #when the CLI runs omo whoami #then it says so with the hint", async () => {
  const result = await run(cli, ["whoami"], {}, "closed-device-login.fixture.ts")
  expect(result.code).toBe(1)
  expect(result.stderr).toContain("Not signed in.")
  expect(result.stderr).toContain("omo login")
  expect(result.requests).toBe(0)
  expect(result.stderr).not.toContain("Cannot access Linux Secret Service")
}, 60_000)

test("#given accounts are closed and no sign-in is stored #when the CLI runs omo logout #then it signs out with no request", async () => {
  const result = await run(cli, ["logout"], {}, "closed-device-login.fixture.ts")
  expect(result.code).toBe(0)
  expect(result.stdout).toContain("Signed out of OmO.")
  expect(result.requests).toBe(0)
  expect(result.stderr).not.toContain("Cannot access Linux Secret Service")
}, 60_000)

// C4 grammar: logout and whoami take --api and refuse anything else with the route-naming refusal.
test.each(["logout", "whoami"])(
  "#given accounts are closed #when the CLI runs omo %s with a stray operand #then it refuses naming the route",
  async (command) => {
    const result = await run(cli, [command, "extra"])
    expect(result.code).toBe(1)
    expect(result.stderr.trim()).toBe(CLOSED_LOGIN_MESSAGE)
    expect(result.requests).toBe(0)
  },
  60_000,
)

// Contract: every sign-in hint follows the same switch as the commands (#11379); while closed the hint names BOTH
// routes (C11), because omo login now runs.
test("#given accounts are closed #then sign-in hints name both routes, and omo login once accounts open", () => {
  expect(signInRoute()).toBe("desktop")
  expect(signInRoute(true)).toBe("cli")
  expect(signInHint("first")).toContain("omo login")
  expect(signInHint("again")).toContain("omo login")
})

test("#given accounts are closed #then the toolkit help lists no service account command", () => {
  const program = new Command("omo")
  configureServiceAuthCommands(program)
  program.addCommand(createMcpOAuthCommand())
  const help = program.helpInformation()
  for (const name of ["login", "logout", "whoami"]) expect(help).not.toMatch(new RegExp(`^\\s+${name}\\b`, "m"))
  expect(help).toMatch(/^\s+mcp\b/m)
})

test.each(["login", "logout", "whoami"])(
  "#given accounts are closed #when the CLI runs omo help %s #then it describes the closed command",
  async (name) => {
    const result = await run(cli, ["help", name])
    expect(result.code).toBe(0)
    if (name === "login") expect(result.stdout).toContain("--device")
    if (name === "logout") expect(result.stdout).toContain("Sign out of OmO")
    if (name === "whoami") expect(result.stdout).toContain("Show the current OmO device sign-in")
    expect(result.stderr).not.toContain(CLOSED_LOGIN_MESSAGE)
    expect(result.requests).toBe(0)
  },
  60_000,
)

test("#given accounts are closed #then provider sign-in commands are still registered and visible", () => {
  const oauth = createMcpOAuthCommand().commands.find((command) => command.name() === "oauth")
  if (!oauth) throw new Error("mcp oauth command missing")
  const login = oauth.commands.find((command) => command.name() === "login")
  expect(login).toBeDefined()
  expect(oauth.helpInformation()).toMatch(/^\s+login\b/m)
})
