#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  copyFileSync,
} from "node:fs"
import http from "node:http"
import net from "node:net"
import os from "node:os"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const defaultArchive = join(repoRoot, ".omo/evidence/20261121-fork-harness-refactor/opencode-v2-candidate.tgz")
const defaultEvidence = join(repoRoot, ".omo/evidence/20261121-fork-harness-refactor/opencode-v2-acceptance")
const verifiedOpenCodeVersion = "2.3.2"
const strictPath = "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"

function usage() {
  return `Usage: bun script/qa/opencode-v2-acceptance.mjs [options]

Options:
  --candidate <archive>   Packaged V2 plugin archive (default: leader candidate archive)
  --evidence-dir <dir>    Nonexistent evidence directory (default: leader acceptance dir)
  --opencode <binary>     OpenCode 2.3.2 binary (default: /opt/homebrew/bin/opencode)
  --mode <mode>           Run control, candidate, or all (default: all)
  --expect-red            Expect candidate checks to fail; used only to freeze a RED proof
  --force                 Replace an existing evidence directory
  -h, --help              Show this help

The driver binds the model provider to a random loopback port, gives every scenario
its own HOME/XDG tree, and writes request/response plus SQLite isolation evidence.
It never reads credentials and does not invoke package lifecycle scripts.`
}

function parseArgs(argv) {
  const options = {
    candidate: defaultArchive,
    evidenceDir: defaultEvidence,
    opencode: "/opt/homebrew/bin/opencode",
    mode: "all",
    expectRed: false,
    force: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[index + 1]
      if (value === undefined) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }
    if (arg === "--candidate") options.candidate = resolve(next())
    else if (arg === "--evidence-dir") options.evidenceDir = resolve(next())
    else if (arg === "--opencode") options.opencode = resolve(next())
    else if (arg === "--mode") {
      options.mode = next()
      if (!["control", "candidate", "all"].includes(options.mode)) {
        throw new Error("--mode must be control, candidate, or all")
      }
    } else if (arg === "--expect-red") options.expectRed = true
    else if (arg === "--force") options.force = true
    else if (arg === "-h" || arg === "--help") options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex")
}

function writeText(file, value, options = {}) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, value, options)
}

function writeJson(file, value) {
  writeText(file, `${JSON.stringify(value, null, 2)}\n`)
}

function commandText(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  })
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message,
  }
}

function sqliteReadOnlyCount(file, table) {
  const result = commandText("/usr/bin/sqlite3", [`file:${file}?mode=ro`, `SELECT count(*) FROM ${table};`])
  if (result.status !== 0) {
    throw new Error(`sqlite read failed for ${file}: ${result.stderr.trim()}`)
  }
  return Number(result.stdout.trim())
}

function realOpenCodeState() {
  const home = process.env.HOME
  if (!home) throw new Error("The driver needs HOME only to read the real OpenCode state fingerprint")
  const db = join(home, ".local/share/opencode/opencode.db")
  const config = join(home, ".config/opencode/opencode.json")
  return {
    home,
    db,
    dbExists: existsSync(db),
    dbCount: existsSync(db) ? sqliteReadOnlyCount(db, "session_v2") : null,
    config,
    configExists: existsSync(config),
    configSha256: existsSync(config) ? sha256(config) : null,
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function checkVersion(binary) {
  const version = commandText(binary, ["--version"])
  if (version.status !== 0) throw new Error(`cannot execute ${binary}: ${version.stderr.trim()}`)
  assertEqual(version.stdout.trim(), `opencode v${verifiedOpenCodeVersion}`, "OpenCode version")
  return version.stdout.trim()
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer()
    server.unref()
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address !== null ? address.port : 0
      server.close(() => resolvePort(port))
    })
    server.on("error", reject)
  })
}

function contentToText(content) {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part
        if (typeof part?.text === "string") return part.text
        return JSON.stringify(part)
      })
      .join("\n")
  }
  return JSON.stringify(content ?? "")
}

function messageText(body) {
  return (body?.messages ?? []).map((message) => `${message.role ?? ""}: ${contentToText(message.content)}`).join("\n")
}

function latestUserText(body) {
  const messages = body?.messages ?? []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === "user") return contentToText(message.content)
  }
  return ""
}

function isTitleRequest(body) {
  const text = messageText(body)
  return (
    text.includes("You name conversations") || text.includes("Name conversations") || text.includes("Generate a title")
  )
}

function successfulOmoStatusResult(body) {
  const toolMessages = (body?.messages ?? []).filter((message) => message?.role === "tool")
  for (let index = toolMessages.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(contentToText(toolMessages[index].content))
      if (parsed?.capabilities?.includes?.("omo_status")) return true
    } catch {}
  }
  return false
}

function chatChunk(call, delta, finishReason = null) {
  return {
    id: `chatcmpl-${call}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "smoke",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  }
}

function sendChatSse(response, chunks) {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  })
  for (const chunk of chunks) response.write(`data: ${JSON.stringify(chunk)}\n\n`)
  response.write("data: [DONE]\n\n")
  response.end()
}

class MockOpenAI {
  constructor(logFile, scenario) {
    this.logFile = logFile
    this.scenario = scenario
    this.server = null
    this.port = 0
    this.call = 0
  }

  async start() {
    this.port = await freePort()
    this.server = http.createServer((request, response) => {
      let raw = ""
      request.on("data", (chunk) => {
        raw += chunk
      })
      request.on("error", () => response.destroy())
      request.on("end", () => {
        const authorization = request.headers.authorization ?? ""
        mkdirSync(dirname(this.logFile), { recursive: true })
        writeText(
          this.logFile,
          `${JSON.stringify({
            method: request.method,
            url: `http://${request.headers.host ?? "unknown"}${request.url}`,
            authorization,
            body: raw,
          })}\n`,
          { flag: "a" },
        )
        if (request.method === "GET" && request.url === "/health") {
          response.writeHead(200, { "content-type": "text/plain" }).end("ok")
          return
        }
        if (request.method !== "POST" || !request.url.endsWith("/chat/completions")) {
          response
            .writeHead(404, { "content-type": "application/json" })
            .end(JSON.stringify({ error: "unsupported route" }))
          return
        }
        let body = {}
        try {
          body = JSON.parse(raw)
        } catch {
          response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid JSON" }))
          return
        }
        this.call += 1
        if (isTitleRequest(body)) {
          sendChatSse(response, [
            chatChunk(this.call, { role: "assistant", content: "OpenCode V2 acceptance" }),
            chatChunk(this.call, {}, "stop"),
          ])
          return
        }
        const text = latestUserText(body)
        const messages = body.messages ?? []
        const hasCurrentToolResult = messages.at(-1)?.role === "tool"
        const hasSuccessfulToolResult = successfulOmoStatusResult(body)
        if (this.scenario === "control") {
          sendChatSse(response, [
            chatChunk(this.call, { role: "assistant", content: "CONTROL_OK" }),
            chatChunk(this.call, {}, "stop"),
          ])
          return
        }
        if (text.includes("TOOL_PROBE") && !hasCurrentToolResult) {
          sendChatSse(response, [
            chatChunk(this.call, {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  index: 0,
                  id: `call-${this.call}`,
                  type: "function",
                  function: { name: "omo_status", arguments: "{}" },
                },
              ],
            }),
            chatChunk(this.call, {}, "tool_calls"),
          ])
          return
        }
        sendChatSse(response, [
          chatChunk(this.call, {
            role: "assistant",
            content: hasCurrentToolResult
              ? hasSuccessfulToolResult
                ? "TOOL_ROUNDTRIP_OK"
                : "TOOL_ROUNDTRIP_FAILED"
              : "MODEL_TEXT_OK",
          }),
          chatChunk(this.call, {}, "stop"),
        ])
      })
    })
    await new Promise((resolveListen, reject) => {
      this.server.once("error", reject)
      this.server.listen(this.port, "127.0.0.1", resolveListen)
    })
    return this
  }

  async stop() {
    if (!this.server) return
    await new Promise((resolveClose) => this.server.close(resolveClose))
    this.server = null
  }
}

function createSandbox(parent, name, port, pluginPackage = null) {
  const root = mkdtempSync(join(parent, `${name}-`))
  const home = join(root, "home")
  const project = join(root, "project")
  const data = join(home, ".local/share")
  const config = join(home, ".config")
  const cache = join(home, ".cache")
  const state = join(home, ".local/state")
  for (const directory of [data, config, cache, state, project]) mkdirSync(directory, { recursive: true })
  const provider = {
    fixture: {
      npm: "@ai-sdk/openai-compatible",
      name: "fixture",
      options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: "test-only" },
      models: { smoke: { name: "smoke", capabilities: { tools: true } } },
    },
  }
  const opencodeConfig = { provider }
  if (pluginPackage) opencodeConfig.plugins = [{ package: pluginPackage }]
  writeJson(join(project, "opencode.json"), opencodeConfig)
  const env = {
    PATH: strictPath,
    HOME: home,
    TMPDIR: root,
    XDG_DATA_HOME: data,
    XDG_CONFIG_HOME: config,
    XDG_CACHE_HOME: cache,
    XDG_STATE_HOME: state,
    NODE_COMPILE_CACHE: join(root, "node-compile-cache"),
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(root, "bun-transpiler"),
    NO_COLOR: "1",
  }
  mkdirSync(env.NODE_COMPILE_CACHE, { recursive: true })
  mkdirSync(env.BUN_RUNTIME_TRANSPILER_CACHE_PATH, { recursive: true })
  return { root, home, project, data, config, cache, state, env, opencodeConfig }
}

function runOpenCode(binary, args, sandbox, timeoutMs = 45000) {
  return new Promise((resolveRun) => {
    const child = spawn(binary, args, {
      cwd: sandbox.project,
      env: sandbox.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let settled = false
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs)
    const finish = (status, signal, timedOut = false) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveRun({ status, signal, timedOut, stdout, stderr })
    }
    child.stdout.on("data", (chunk) => {
      stdout += chunk
      if (stdout.length > 8 * 1024 * 1024) child.kill("SIGTERM")
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
      if (stderr.length > 8 * 1024 * 1024) child.kill("SIGTERM")
    })
    child.on("error", (error) => {
      stderr += `${error.message}\n`
      finish(1, null)
    })
    child.on("close", (status, signal) => finish(status, signal, signal === "SIGTERM"))
  })
}

function parseJsonLines(value) {
  return value
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return { type: "unparsable", line }
      }
    })
}

function jsonl(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function summarizeRequests(logFile) {
  if (!existsSync(logFile)) return []
  return jsonl(logFile).map((entry, index) => {
    let body = {}
    try {
      body = JSON.parse(entry.body)
    } catch {}
    const text = messageText(body)
    const bodyText = JSON.stringify(body)
    const tools = Array.isArray(body.tools)
      ? body.tools.map((tool) => tool.function?.name ?? tool.name).filter(Boolean)
      : []
    const toolMessages = (body.messages ?? []).filter((message) => message.role === "tool")
    return {
      index,
      method: entry.method,
      url: entry.url,
      authorization: entry.authorization,
      title: isTitleRequest(body),
      tools,
      ultraworkContextCount: (bodyText.match(/<ultrawork-mode>/g) ?? []).length,
      sisyphusPrompt: bodyText.includes("You are Sisyphus"),
      omoStatusTool: tools.includes("omo_status"),
      toolResultCount: toolMessages.length,
      toolResults: toolMessages.map((message) => contentToText(message.content)),
      promptContainsToolProbe: text.includes("TOOL_PROBE"),
      requestSizeBytes: entry.body.length,
    }
  })
}

function outputEvents(result) {
  return parseJsonLines(result.stdout)
}

function outputText(result) {
  return outputEvents(result)
    .filter((event) => event.type === "text")
    .map((event) => event.part?.text ?? "")
    .join("")
}

function outputToolNames(result) {
  return outputEvents(result)
    .filter((event) => event.type === "tool_use")
    .map((event) => event.part?.tool ?? event.part?.name ?? event.toolName ?? "")
    .filter(Boolean)
}

function sessionId(result) {
  return outputEvents(result).find((event) => event.type === "step_start")?.sessionID ?? null
}

function assertCondition(checks, id, passed, details) {
  checks.push({ id, status: passed ? "PASS" : "FAIL", details })
  return passed
}

function inspectArchive(archive, evidenceDir) {
  if (!isAbsolute(archive)) throw new Error("candidate archive must be an absolute path")
  if (!existsSync(archive)) throw new Error(`candidate archive does not exist: ${archive}`)
  const listing = commandText("/usr/bin/tar", ["-tzf", archive])
  if (listing.status !== 0) throw new Error(`cannot inspect archive: ${listing.stderr.trim()}`)
  const files = listing.stdout.split("\n").filter(Boolean)
  const checks = []
  assertCondition(checks, "archive.nonempty", files.length > 0, `${files.length} entries`)
  assertCondition(checks, "archive.entrypoint", files.includes("package/dist/index.js"), "package/dist/index.js")
  assertCondition(
    checks,
    "archive.sisyphus",
    files.includes("package/packages/omo-opencode/.opencode/agents/sisyphus.md"),
    "package/packages/omo-opencode/.opencode/agents/sisyphus.md",
  )
  assertCondition(
    checks,
    "archive.no-node-modules",
    !files.some((file) => file.includes("/node_modules/") || file.endsWith("/node_modules")),
    "no packaged node_modules",
  )
  const entrypoint = commandText("/usr/bin/tar", ["-xOf", archive, "package/dist/index.js"])
  if (entrypoint.status !== 0) {
    throw new Error(`cannot read packaged entrypoint: ${entrypoint.stderr.trim()}`)
  }
  writeText(join(evidenceDir, "candidate-entrypoint.js"), entrypoint.stdout)
  assertCondition(
    checks,
    "archive.host-sdk-external",
    entrypoint.stdout.includes('from "@opencode/plugin/promise/plugin"'),
    "dist/index.js imports @opencode/plugin/promise/plugin externally",
  )
  assertCondition(
    checks,
    "archive.host-sdk-unbundled",
    !/\b(?:function|var|const|let)\s+define\s*\(/.test(entrypoint.stdout),
    "dist/index.js does not contain the bundled @opencode/plugin define implementation",
  )
  const packageJson = commandText("/usr/bin/tar", ["-xOf", archive, "package/package.json"])
  if (packageJson.status !== 0) {
    throw new Error(`cannot read packaged package.json: ${packageJson.stderr.trim()}`)
  }
  writeText(join(evidenceDir, "candidate-package.json"), packageJson.stdout)
  let dependencies = {}
  try {
    dependencies = JSON.parse(packageJson.stdout).dependencies ?? {}
  } catch {}
  assertCondition(
    checks,
    "archive.host-sdk-dependency",
    dependencies["@opencode/plugin"] === "2.3.2",
    `@opencode/plugin@${dependencies["@opencode/plugin"] ?? "missing"} in production dependencies`,
  )
  writeText(join(evidenceDir, "candidate-archive-list.txt"), `${files.join("\n")}\n`)
  writeJson(join(evidenceDir, "candidate-archive-checks.json"), {
    archive,
    sha256: sha256(archive),
    bytes: statSync(archive).size,
    checks,
  })
  return { files, checks }
}

function unpackArchive(archive, destination) {
  mkdirSync(destination, { recursive: true })
  const unpacked = commandText("/usr/bin/tar", ["-xzf", archive, "-C", destination, "--strip-components=1"])
  if (unpacked.status !== 0) throw new Error(`unpack failed: ${unpacked.stderr.trim()}`)
  return join(destination)
}

async function controlScenario(options, evidenceDir, runRoot, version, realBefore) {
  const evidence = join(evidenceDir, "control")
  mkdirSync(evidence, { recursive: true })
  const mock = await new MockOpenAI(join(evidence, "model-requests.jsonl"), "control").start()
  const sandbox = createSandbox(runRoot, "control", mock.port)
  const checks = []
  try {
    const args = [
      "run",
      "--standalone",
      "--print-logs",
      "--format",
      "json",
      "--model",
      "fixture/smoke",
      "CONTROL_NO_PLUGIN say exactly: CONTROL_OK",
    ]
    const result = await runOpenCode(options.opencode, args, sandbox)
    writeText(join(evidence, "run.stdout"), result.stdout)
    writeText(join(evidence, "run.stderr"), result.stderr)
    writeText(join(evidence, "run.exit"), `${result.status ?? 1}\n`)
    const requests = summarizeRequests(join(evidence, "model-requests.jsonl"))
    writeJson(join(evidence, "model-request-summary.json"), requests)
    const modelRequests = requests.filter((request) => !request.title)
    const sandboxDb = join(sandbox.data, "opencode/opencode.db")
    let sandboxCount = null
    if (existsSync(sandboxDb)) sandboxCount = sqliteReadOnlyCount(sandboxDb, "session_v2")
    assertCondition(checks, "control.exit", result.status === 0, `exit=${result.status}`)
    assertCondition(checks, "control.response", outputText(result).includes("CONTROL_OK"), outputText(result))
    assertCondition(
      checks,
      "control.no-error",
      !outputEvents(result).some((event) => event.type === "error"),
      "no CLI error event",
    )
    assertCondition(checks, "control.model-request", modelRequests.length > 0, `${modelRequests.length} requests`)
    assertCondition(
      checks,
      "control.no-sisyphus",
      modelRequests.every((request) => !request.sisyphusPrompt),
      "Sisyphus prompt absent",
    )
    assertCondition(
      checks,
      "control.no-omo-status",
      modelRequests.every((request) => !request.omoStatusTool),
      "omo_status schema absent",
    )
    assertCondition(
      checks,
      "control.no-ultrawork",
      modelRequests.every((request) => request.ultraworkContextCount === 0),
      "ULW context absent",
    )
    assertCondition(
      checks,
      "control.loopback-only",
      requests.every((request) => request.url.startsWith("http://127.0.0.1:")),
      requests.map((request) => request.url).join(","),
    )
    assertCondition(
      checks,
      "control.sandbox-db",
      sandboxCount !== null && sandboxCount > 0,
      `sandbox session_v2 count=${sandboxCount}`,
    )
    writeJson(join(evidence, "summary.json"), {
      scenario: "control",
      version,
      opencodeConfig: sandbox.opencodeConfig,
      environment: {
        HOME: sandbox.env.HOME,
        TMPDIR: sandbox.env.TMPDIR,
        XDG_DATA_HOME: sandbox.env.XDG_DATA_HOME,
        XDG_CONFIG_HOME: sandbox.env.XDG_CONFIG_HOME,
        XDG_CACHE_HOME: sandbox.env.XDG_CACHE_HOME,
        XDG_STATE_HOME: sandbox.env.XDG_STATE_HOME,
        PATH: sandbox.env.PATH,
      },
      sandbox: { root: sandbox.root, db: sandboxDb, sessionCount: sandboxCount },
      realBefore,
      checks,
    })
    return checks.every((check) => check.status === "PASS")
  } finally {
    await mock.stop()
    rmSync(sandbox.root, { recursive: true, force: true })
  }
}

function toolResultJson(request) {
  for (let index = request.toolResults.length - 1; index >= 0; index -= 1) {
    const value = request.toolResults[index]
    try {
      return JSON.parse(value)
    } catch {}
  }
  return null
}

async function candidateScenario(options, evidenceDir, runRoot, version, realBefore) {
  const evidence = join(evidenceDir, "candidate")
  mkdirSync(evidence, { recursive: true })
  const checks = []
  const archive = inspectArchive(options.candidate, evidence)
  for (const check of archive.checks) checks.push(check)
  const mock = await new MockOpenAI(join(evidence, "model-requests.jsonl"), "candidate").start()
  const sandbox = createSandbox(runRoot, "candidate", mock.port)
  const packageRoot = join(sandbox.root, "candidate-package")
  unpackArchive(options.candidate, packageRoot)
  assertCondition(
    checks,
    "candidate.cold-unpack",
    !existsSync(join(packageRoot, "node_modules")),
    `unpacked package has no node_modules; plugin package=${packageRoot}`,
  )
  const packagedAgent = join(packageRoot, "packages/omo-opencode/.opencode/agents/sisyphus.md")
  const stagedAgent = join(sandbox.project, ".opencode/agents/sisyphus.md")
  mkdirSync(dirname(stagedAgent), { recursive: true })
  copyFileSync(packagedAgent, stagedAgent)
  const stagedAgentSha256 = sha256(stagedAgent)
  writeText(join(evidence, "staged-sisyphus.sha256"), `${stagedAgentSha256}  .opencode/agents/sisyphus.md\n`)
  assertCondition(
    checks,
    "candidate.sisyphus-markdown-staged",
    stagedAgentSha256 === sha256(packagedAgent),
    `source=${packagedAgent}; staged=${stagedAgent}; sha256=${stagedAgentSha256}`,
  )
  sandbox.opencodeConfig.plugins = [{ package: packageRoot }]
  writeJson(join(sandbox.project, "opencode.json"), sandbox.opencodeConfig)
  try {
    const common = [
      "run",
      "--standalone",
      "--print-logs",
      "--format",
      "json",
      "--agent",
      "sisyphus",
      "--model",
      "fixture/smoke",
    ]
    const turns = [
      {
        id: "standard-tool",
        prompt: "V2_STANDARD_TOOL_PROBE say exactly: STANDARD_TOOL_OK",
        continuation: false,
        expectTool: true,
        expectUltrawork: false,
      },
      {
        id: "ulw-one",
        prompt: "ultrawork V2_ULW_ONE_TOOL_PROBE say exactly: ULW_ONE_OK",
        continuation: true,
        expectTool: true,
        expectUltrawork: true,
      },
      {
        id: "ordinary-after-ulw",
        prompt: "V2_ORDINARY_AFTER_ULW say exactly: ORDINARY_AFTER_ULW_OK",
        continuation: true,
        expectTool: false,
        expectUltrawork: false,
      },
      {
        id: "ulw-two",
        prompt: "ultrawork V2_ULW_TWO_TOOL_PROBE say exactly: ULW_TWO_OK",
        continuation: true,
        expectTool: true,
        expectUltrawork: true,
      },
    ]
    let sessionID = null
    const results = []
    const requestMarker = new Map()
    for (const turn of turns) {
      const requestStart = summarizeRequests(join(evidence, "model-requests.jsonl")).length
      const args = [...common]
      if (turn.continuation && sessionID) args.push("--session", sessionID)
      args.push(turn.prompt)
      const result = await runOpenCode(options.opencode, args, sandbox)
      const requestEnd = summarizeRequests(join(evidence, "model-requests.jsonl")).length
      requestMarker.set(turn.id, { start: requestStart, end: requestEnd })
      writeText(join(evidence, `${turn.id}.stdout`), result.stdout)
      writeText(join(evidence, `${turn.id}.stderr`), result.stderr)
      writeText(join(evidence, `${turn.id}.exit`), `${result.status ?? 1}\n`)
      if (!sessionID) sessionID = sessionId(result)
      results.push({ turn, result })
      assertCondition(
        checks,
        `candidate.${turn.id}.exit`,
        result.status === 0,
        `exit=${result.status}; stderr=${result.stderr.slice(-1000)}`,
      )
      if (turn.expectTool) {
        assertCondition(
          checks,
          `candidate.${turn.id}.roundtrip`,
          outputText(result).includes("TOOL_ROUNDTRIP_OK") && outputToolNames(result).includes("omo_status"),
          `text=${outputText(result)} tools=${outputToolNames(result).join(",")}`,
        )
      } else {
        assertCondition(
          checks,
          `candidate.${turn.id}.text`,
          outputText(result).includes("MODEL_TEXT_OK"),
          outputText(result),
        )
      }
    }
    const requests = summarizeRequests(join(evidence, "model-requests.jsonl"))
    writeJson(join(evidence, "model-request-summary.json"), requests)
    const modelRequests = requests.filter((request) => !request.title)
    assertCondition(
      checks,
      "candidate.sisyphus-present",
      sessionID !== null && modelRequests.length > 0 && modelRequests.every((request) => request.sisyphusPrompt),
      `session=${sessionID}; requests=${modelRequests.length}`,
    )
    assertCondition(
      checks,
      "candidate.omo-status-schema",
      modelRequests.length > 0 && modelRequests.every((request) => request.omoStatusTool),
      modelRequests.map((request) => request.omoStatusTool).join(","),
    )
    assertCondition(
      checks,
      "candidate.cold-unpack-resolution",
      !existsSync(join(packageRoot, "node_modules")) &&
        modelRequests.length > 0 &&
        modelRequests.every((request) => request.omoStatusTool),
      `host resolved the externally imported SDK from the cold unpack and exposed omo_status in ${modelRequests.length} model requests`,
    )
    assertCondition(
      checks,
      "candidate.loopback-only",
      requests.every((request) => request.url.startsWith("http://127.0.0.1:")),
      requests.map((request) => request.url).join(","),
    )
    for (const { turn } of results) {
      const marker = requestMarker.get(turn.id)
      const turnRequests = requests.slice(marker.start, marker.end)
      assertCondition(
        checks,
        `candidate.${turn.id}.context`,
        turnRequests.length > 0 &&
          turnRequests.every((request) =>
            turn.expectUltrawork ? request.ultraworkContextCount === 1 : request.ultraworkContextCount === 0,
          ),
        turnRequests.map((request) => request.ultraworkContextCount).join(","),
      )
      if (turn.expectTool) {
        const continuation = [...turnRequests].reverse().find((request) => request.toolResultCount > 0)
        const parsed = continuation ? toolResultJson(continuation) : null
        assertCondition(
          checks,
          `candidate.${turn.id}.status-result`,
          parsed !== null &&
            parsed.sessionID === sessionID &&
            parsed.mode === (turn.expectUltrawork ? "ultrawork" : "standard") &&
            parsed.capabilities?.includes?.("omo_status") === true,
          JSON.stringify(parsed),
        )
      }
    }
    const sandboxDb = join(sandbox.data, "opencode/opencode.db")
    const sandboxCount = existsSync(sandboxDb) ? sqliteReadOnlyCount(sandboxDb, "session_v2") : null
    assertCondition(
      checks,
      "candidate.sandbox-db",
      sandboxCount !== null && sandboxCount > 0,
      `sandbox session_v2 count=${sandboxCount}`,
    )
    writeJson(join(evidence, "summary.json"), {
      scenario: "candidate",
      version,
      candidate: { archive: options.candidate, sha256: sha256(options.candidate), packageRoot },
      sessionID,
      opencodeConfig: sandbox.opencodeConfig,
      environment: {
        HOME: sandbox.env.HOME,
        TMPDIR: sandbox.env.TMPDIR,
        XDG_DATA_HOME: sandbox.env.XDG_DATA_HOME,
        XDG_CONFIG_HOME: sandbox.env.XDG_CONFIG_HOME,
        XDG_CACHE_HOME: sandbox.env.XDG_CACHE_HOME,
        XDG_STATE_HOME: sandbox.env.XDG_STATE_HOME,
        PATH: sandbox.env.PATH,
      },
      stagedAgent: { source: packagedAgent, staged: stagedAgent, sha256: stagedAgentSha256 },
      sandbox: { root: sandbox.root, db: sandboxDb, sessionCount: sandboxCount },
      realBefore,
      checks,
    })
    return checks.every((check) => check.status === "PASS")
  } finally {
    await mock.stop()
    rmSync(sandbox.root, { recursive: true, force: true })
  }
}

function writeReadme(evidenceDir, summary, options, version) {
  const allChecks = [...summary.controlChecks, ...summary.candidateChecks]
  const lines = [
    "# OpenCode 2.3.2 V2 packaged fork acceptance",
    "",
    `Captured: ${new Date().toISOString()}`,
    `OpenCode: ${version}`,
    `Candidate: ${options.candidate}`,
    `Candidate SHA256: ${sha256(options.candidate)}`,
    "",
    "## What was tested",
    "",
    "- Real OpenCode 2.3.2 `run --standalone` under a strict disposable HOME and XDG environment.",
    "- A loopback OpenAI-compatible SSE provider, including real `omo_status` tool-call continuation requests.",
    "- No-plugin control, packaged artifact inspection, Sisyphus roster loading, and multi-turn ULW context behavior.",
    "- Read-only real SQLite/config fingerprinting and disposable sandbox DB proof.",
    "",
    "## What was observed",
    "",
    ...allChecks.map((check) => `- ${check.status} ${check.id}: ${check.details}`),
    "",
    "## Why it is enough",
    "",
    "Assertions use actual CLI JSON events and captured model request bodies. A tool round trip is accepted only after the next provider request contains the host-produced `omo_status` result. ULW checks inspect both the initiating and continuation requests.",
    "",
    "## What was omitted",
    "",
    "No credentials, real provider traffic, user profile, or non-loopback model endpoint was used. Full synthetic request bodies stay in `model-requests.jsonl`; authorization values are only the fixture's synthetic `test-only` bearer token.",
    "",
    "## Reproduce",
    "",
    `bun script/qa/opencode-v2-acceptance.mjs --candidate ${options.candidate} --evidence-dir <new-dir>`,
    "",
  ]
  writeText(join(evidenceDir, "README.md"), lines.join("\n"))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }
  if (existsSync(options.evidenceDir) && !options.force) {
    throw new Error(`evidence directory already exists: ${options.evidenceDir}; use a new path or --force`)
  }
  if (relative(repoRoot, options.evidenceDir).startsWith("..")) {
    throw new Error("evidence directory must stay inside the repository")
  }
  rmSync(options.evidenceDir, { recursive: true, force: true })
  mkdirSync(options.evidenceDir, { recursive: true })
  const ignored = commandText("/usr/bin/git", ["check-ignore", "-q", options.evidenceDir], { cwd: repoRoot })
  if (ignored.status !== 0) throw new Error("evidence directory is not gitignored")
  const version = checkVersion(options.opencode)
  const realBefore = realOpenCodeState()
  const runRoot = mkdtempSync(join(os.tmpdir(), "opencode-v2-acceptance-"))
  const summary = {
    startedAt: new Date().toISOString(),
    mode: options.mode,
    expected: options.expectRed ? "RED candidate" : "GREEN candidate",
    version,
    realBefore,
    controlChecks: [],
    candidateChecks: [],
  }
  let controlPassed = true
  let candidatePassed = true
  try {
    if (options.mode === "control" || options.mode === "all") {
      controlPassed = await controlScenario(options, options.evidenceDir, runRoot, version, realBefore)
      const controlSummary = join(options.evidenceDir, "control/summary.json")
      summary.controlChecks = existsSync(controlSummary) ? JSON.parse(readFileSync(controlSummary, "utf8")).checks : []
    }
    if (options.mode === "candidate" || options.mode === "all") {
      candidatePassed = await candidateScenario(options, options.evidenceDir, runRoot, version, realBefore)
      const candidateSummary = join(options.evidenceDir, "candidate/summary.json")
      summary.candidateChecks = existsSync(candidateSummary)
        ? JSON.parse(readFileSync(candidateSummary, "utf8")).checks
        : [{ id: "candidate.archive", status: "FAIL", details: "scenario did not produce a summary" }]
    }
  } finally {
    rmSync(runRoot, { recursive: true, force: true })
  }
  const realAfter = realOpenCodeState()
  summary.finishedAt = new Date().toISOString()
  summary.realAfter = realAfter
  summary.isolation = {
    status:
      realBefore.dbExists === realAfter.dbExists &&
      realBefore.dbCount === realAfter.dbCount &&
      realBefore.configExists === realAfter.configExists &&
      realBefore.configSha256 === realAfter.configSha256
        ? "PASS"
        : "FAIL",
  }
  summary.cleanup = { status: existsSync(runRoot) ? "FAIL" : "PASS", runRoot }
  summary.control = controlPassed
  summary.candidate = candidatePassed
  summary.overall =
    controlPassed && (options.expectRed ? !candidatePassed : candidatePassed) && summary.isolation.status === "PASS"
  writeJson(join(options.evidenceDir, "summary.json"), summary)
  writeReadme(options.evidenceDir, summary, options, version)
  const hashes = []
  const collect = (directory) => {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) collect(file)
      else hashes.push(`${sha256(file)}  ${relative(options.evidenceDir, file)}`)
    }
  }
  collect(options.evidenceDir)
  writeText(join(options.evidenceDir, "sha256.txt"), `${hashes.join("\n")}\n`)
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  if (!summary.overall) process.exitCode = 1
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
