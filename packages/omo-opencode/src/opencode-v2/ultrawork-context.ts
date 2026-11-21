import { CONTEXT_METADATA_KEY, shouldInjectUltraworkContext } from "./session-mode"

type MutableSystemPart = {
  readonly type?: unknown
  readonly text?: unknown
  readonly metadata?: Record<string, unknown>
}

export const OPENCODE_V2_ULTRAWORK_INSTRUCTION = `<ultrawork-mode>
Work in evidence-bound ultrawork mode for this user turn.

- Restate the concrete goal, constraints, and completion criteria before editing.
- Inspect the real repository surface and preserve unrelated work.
- Make the smallest correct change, then run targeted validation and broaden only when the touched behavior crosses a shared boundary.
- Treat skipped, inferred, or unavailable validation as incomplete; record the exact command, outcome, and remaining risk.
- Continue autonomously through reversible local work. Ask only when missing authority or an irreversible decision blocks progress.
- Tool continuation requests in this turn retain this instruction; a later ordinary user turn does not.
</ultrawork-mode>`

export function injectUltraworkContext(context: {
  agent: string
  messages: ReadonlyArray<{ role?: unknown; metadata?: unknown }>
  system: Array<MutableSystemPart>
}): boolean {
  if (!shouldInjectUltraworkContext(context as Parameters<typeof shouldInjectUltraworkContext>[0])) return false
  if (context.system.some((part) => part.metadata?.[CONTEXT_METADATA_KEY] === true)) return false

  context.system.push({
    type: "text",
    text: OPENCODE_V2_ULTRAWORK_INSTRUCTION,
    metadata: { [CONTEXT_METADATA_KEY]: true },
  })
  return true
}
