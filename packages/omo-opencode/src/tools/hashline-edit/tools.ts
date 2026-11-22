import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { publishToolMetadata } from "../../features/tool-metadata-store"
import { executeHashlineEditTool } from "./hashline-edit-executor"
import type { FormatterClient } from "./formatter-trigger"
import { HASHLINE_EDIT_DESCRIPTION } from "./tool-description"
import type { PluginContext } from "../../plugin/types"

export function createHashlineEditTool(ctx?: PluginContext): ToolDefinition {
  return tool({
    description: HASHLINE_EDIT_DESCRIPTION,
    args: {
      filePath: tool.schema.string().describe("Absolute path to the file to edit"),
      delete: tool.schema.boolean().optional().describe("Delete file instead of editing"),
      rename: tool.schema.string().optional().describe("Rename output file path after edits"),
      edits: tool.schema
        .array(
          tool.schema.object({
            op: tool.schema
              .union([tool.schema.literal("replace"), tool.schema.literal("append"), tool.schema.literal("prepend")])
              .describe("Hashline edit operation mode"),
            pos: tool.schema.string().optional().describe("Primary anchor in LINE#ID format"),
            end: tool.schema.string().optional().describe("Range end anchor in LINE#ID format"),
            lines: tool.schema
              .union([tool.schema.array(tool.schema.string()), tool.schema.string(), tool.schema.null()])
              .describe("Replacement or inserted lines as newline-delimited string. null deletes with replace"),
          }),
        )
        .describe("Array of edit operations to apply (empty when delete=true)"),
    },
    execute: (args, context) =>
      executeHashlineEditTool(args, {
        directory: context.directory,
        publish: (metadata) => publishToolMetadata(context, metadata),
        formatterClient: ctx?.client as FormatterClient | undefined,
      }),
  })
}
