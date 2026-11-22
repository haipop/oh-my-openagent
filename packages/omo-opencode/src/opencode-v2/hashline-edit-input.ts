import { z } from "zod"

export const hashlineEditInput = z.object({
  filePath: z.string().min(1).describe("Absolute path to the file to edit"),
  delete: z.boolean().optional().describe("Delete file instead of editing"),
  rename: z.string().min(1).optional().describe("Rename output file path after edits"),
  edits: z
    .array(
      z.object({
        op: z.enum(["replace", "append", "prepend"]).describe("Hashline edit operation mode"),
        pos: z.string().optional().describe("Primary anchor in LINE#ID format"),
        end: z.string().optional().describe("Range end anchor in LINE#ID format"),
        lines: z
          .union([z.array(z.string()), z.string(), z.null()])
          .describe("Replacement or inserted lines as newline-delimited string. null deletes with replace"),
      }),
    )
    .describe("Array of edit operations to apply (empty when delete=true)"),
})
