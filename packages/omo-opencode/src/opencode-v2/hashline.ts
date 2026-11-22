import { lstat, realpath } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import type { Context } from "@opencode/plugin/promise/plugin"
import { Error as ToolError } from "@opencode/plugin/promise/tool"
import { transformHashlineReadOutput } from "../hooks/hashline-read-enhancer/hook"
import { executeHashlineEditTool } from "../tools/hashline-edit/hashline-edit-executor"
import { HASHLINE_EDIT_DESCRIPTION } from "../tools/hashline-edit/tool-description"
import { hashlineEditInput } from "./hashline-edit-input"

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

async function workspaceFile(directory: string, root: string, input: string) {
  const path = resolve(directory, input)
  try {
    const canonicalPath = join(await realpath(dirname(path)), basename(path))
    if (!isInside(root, canonicalPath)) throw new Error("not a workspace path")
    const stat = await lstat(canonicalPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
    })
    if (stat && (!stat.isFile() || stat.nlink > 1)) throw new Error("not a regular unlinked file")
    const resource = (from: string, to: string) => relative(from, to).split(sep).join("/")
    const canonicalResource = resource(root, canonicalPath)
    const lexicalResource = isInside(directory, path) ? resource(directory, path) : canonicalResource
    return { path: canonicalPath, resources: [lexicalResource, canonicalResource] }
  } catch {
    throw new ToolError({ message: `Hashline requires a regular file inside the workspace: ${input}` })
  }
}

function formatReadContent(content: string): string {
  const endOfHeader = content.indexOf("\n")
  if (endOfHeader < 0 || !content.startsWith("Read file ")) return content
  return content.slice(0, endOfHeader + 1) + transformHashlineReadOutput(content.slice(endOfHeader + 1))
}

export async function registerHashline(
  { location, permission, tool }: Pick<Context, "location" | "permission" | "tool">,
  readEnabled: boolean,
) {
  if (readEnabled) {
    await tool.hook("execute.after", (event) => {
      if (event.tool !== "read" || event.status !== "completed") return
      const { result } = event
      if (typeof result.output !== "object" || result.output === null || result.output.type !== "text") return
      event.result = {
        ...result,
        content:
          typeof result.content === "string"
            ? formatReadContent(result.content)
            : result.content?.map((part) =>
                part.type === "text" ? { ...part, text: formatReadContent(part.text) } : part,
              ),
      }
    })
  }

  await tool.transform((editor) => {
    editor.update("edit", (definition) => {
      definition.description = HASHLINE_EDIT_DESCRIPTION
      definition.input = hashlineEditInput
      definition.output = undefined
      definition.execute = async (input, context) => {
        const args = hashlineEditInput.parse(input)
        const root = await realpath(location.directory)
        const source = await workspaceFile(location.directory, root, args.filePath)
        const target = args.rename ? await workspaceFile(location.directory, root, args.rename) : undefined
        const invocation = {
          sessionID: context.sessionID,
          agent: context.agent,
          source: { type: "tool" as const, messageID: context.messageID, id: context.id },
        }
        const resources = [...new Set([...source.resources, ...(target?.resources ?? [])])]
        if (!args.delete)
          await permission.assert({ ...invocation, action: "read", resources: [...new Set(source.resources)] })
        await permission.assert({ ...invocation, action: "edit", resources, save: ["*"] })

        let metadata: Record<string, unknown> | undefined
        const content = await executeHashlineEditTool(
          { ...args, filePath: source.path, rename: target?.path },
          {
            directory: root,
            publish: (info) => {
              metadata = info.metadata
            },
          },
        )
        return { content, metadata }
      }
    })
  })
}
