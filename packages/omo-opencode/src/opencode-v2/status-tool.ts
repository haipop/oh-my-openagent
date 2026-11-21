import { latestAdmittedUserMode, type SessionModeStatus } from "./session-mode"

const OMO_STATUS_INPUT = {
  type: "object",
  properties: {},
  additionalProperties: false,
  required: [],
} as const

const OMO_STATUS_OUTPUT = {
  type: "object",
  properties: {
    sessionID: { type: "string" },
    mode: { type: "string", enum: ["standard", "ultrawork"] },
    capabilities: { type: "array", items: { type: "string" } },
  },
  required: ["sessionID", "mode", "capabilities"],
  additionalProperties: false,
} as const

type SessionContextReader = {
  readonly context: (input: {
    readonly sessionID: string
  }) => Promise<ReadonlyArray<{ role?: unknown; type?: unknown; metadata?: unknown }>>
}

export function createOmoStatusTool(session: SessionContextReader) {
  return {
    name: "omo_status",
    options: { codemode: false },
    description: "Read the current Oh My OpenAgent session mode and supported V2 capabilities",
    input: OMO_STATUS_INPUT,
    output: OMO_STATUS_OUTPUT,
    async execute(
      _input: unknown,
      context: { readonly sessionID: string },
    ): Promise<{
      output: SessionModeStatus
      content: string
    }> {
      const messages = await session.context({ sessionID: context.sessionID })
      const output: SessionModeStatus = {
        sessionID: context.sessionID,
        mode: latestAdmittedUserMode(messages) ?? "standard",
        capabilities: ["ulw-prompt-context", "omo_status"],
      }
      return { output, content: JSON.stringify(output) }
    },
  }
}
