import { userInfo } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [plugin, method, input] = process.argv.slice(2)
const { createThreadSdk } = await import(pathToFileURL(join(plugin, "runtime", "thread-sdk", "sdk.js")).href)
const sdk = createThreadSdk({
  agentDir: process.env.SENPI_CODING_AGENT_DIR,
  cwd: process.cwd(),
  uid: process.getuid?.() ?? 0,
  user: userInfo().username,
  env: process.env,
})

try {
  const result = await sdk[method](JSON.parse(input))
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = result.kind === "ok" ? 0 : 1
} finally {
  await sdk.dispose()
}
