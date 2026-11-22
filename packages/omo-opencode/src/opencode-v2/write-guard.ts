import type { Context } from "@opencode/plugin/promise/plugin"
import { Error as ToolError } from "@opencode/plugin/promise/tool"
import { createWriteExistingFileGuard } from "../hooks/write-existing-file-guard/hook"

export async function registerWriteGuard({ session, tool }: Pick<Context, "session" | "tool">) {
  const guard = createWriteExistingFileGuard()

  await tool.hook("execute.after", async (event) => {
    if (event.tool !== "read" || event.status !== "completed") return
    const { location } = await session.get({ sessionID: event.sessionID })
    await guard.handle(location.directory, event, { args: event.input })
  })

  await tool.hook("execute.before", async (event) => {
    if (event.tool !== "write") return
    const { location } = await session.get({ sessionID: event.sessionID })
    const output = { args: event.input }
    try {
      await guard.handle(location.directory, event, output)
    } catch (error) {
      throw new ToolError({ message: error instanceof Error ? error.message : String(error) })
    }
    event.input = output.args
  })
}
