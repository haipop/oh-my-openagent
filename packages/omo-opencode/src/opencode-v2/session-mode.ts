import type { SessionContext, SessionPrompt } from "@opencode/plugin/promise/session"
import { detectKeywordsWithType } from "../hooks/keyword-detector/detector"

export const PROMPT_METADATA_KEY = "oh-my-openagent"
export const CONTEXT_METADATA_KEY = "oh-my-openagent.ultrawork"
export const SISYPHUS_AGENT_ID = "sisyphus"

export type OpenCodeV2Mode = "standard" | "ultrawork"

export type PromptModeMetadata = {
  readonly source: "opencode-v2"
  readonly version: 1
  readonly mode: OpenCodeV2Mode
}

export type SessionModeStatus = {
  readonly sessionID: string
  readonly mode: OpenCodeV2Mode
  readonly capabilities: readonly string[]
}

type MutablePromptMetadata = Record<string, unknown>

export function isUltraworkPrompt(text: string): boolean {
  return detectKeywordsWithType(text).some(({ type }) => type === "ultrawork")
}

export function parsePromptModeMetadata(value: unknown): PromptModeMetadata | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const record = value as Record<string, unknown>
  if (record.source !== "opencode-v2" || record.version !== 1) return undefined
  if (record.mode !== "standard" && record.mode !== "ultrawork") return undefined
  return { source: record.source, version: record.version, mode: record.mode }
}

export function markAdmittedPrompt(prompt: SessionPrompt): void {
  const mode: OpenCodeV2Mode = isUltraworkPrompt(prompt.prompt.text) ? "ultrawork" : "standard"
  const existingMetadata: MutablePromptMetadata =
    typeof prompt.metadata === "object" && prompt.metadata !== null ? { ...prompt.metadata } : {}

  prompt.metadata = {
    ...existingMetadata,
    [PROMPT_METADATA_KEY]: { source: "opencode-v2", version: 1, mode } satisfies PromptModeMetadata,
  }
}

export function latestAdmittedUserMode(
  messages: ReadonlyArray<{ role?: unknown; type?: unknown; metadata?: unknown }>,
): OpenCodeV2Mode | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.role !== "user" && message?.type !== "user") continue
    const metadata =
      typeof message.metadata === "object" && message.metadata !== null
        ? (message.metadata as Record<string, unknown>)[PROMPT_METADATA_KEY]
        : undefined
    return parsePromptModeMetadata(metadata)?.mode
  }
  return undefined
}

export function shouldInjectUltraworkContext(context: SessionContext): boolean {
  return context.agent === SISYPHUS_AGENT_ID && latestAdmittedUserMode(context.messages) === "ultrawork"
}
