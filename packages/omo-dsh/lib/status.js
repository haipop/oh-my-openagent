/**
 * Read-only status surface for the adapter.
 *
 * The model (or a human through the model) can ask what this bundle is actually
 * doing in the current session: which modes are enabled, which keywords arm
 * them, which config layers were read, which rules were injected, and how many
 * comment warnings were delivered. It reports; it never changes anything.
 *
 * @module @oh-my-opencode/omo-dsh/status
 */

/** Tool name exposed to the model. */
export const STATUS_TOOL_NAME = "omo_status"

const STATUS_DESCRIPTION = [
  "Report what the OmO adapter (omo-dsh) has in effect for this session: enabled keyword modes and their",
  "keywords, the shared OmO config layers that were read and which keys the plugin row sets, the rule files",
  "loaded and injected, and the comment-check state. Read-only: it changes nothing.",
].join(" ")

/**
 * Build the status payload.
 *
 * @param {{ options: object, rowConfig: Record<string, unknown>, config: { files: string[], layers: Array<{ file: string, config: Record<string, unknown> }>, merged: Record<string, unknown>, rowKeys: string[] }, rules: { loaded: string[], injected: string[] } | undefined, commentWarnings: number }} input - resolved state.
 * @returns {Readonly<object>} serializable status.
 */
export function buildStatus(input) {
  const { options } = input
  const modes = options.enabledModes
  return Object.freeze({
    plugin: "omo-ultrawork",
    enabled: options.enabled,
    applyToSubagents: options.applyToSubagents,
    keywords: Object.freeze([...options.keywords]),
    modes: Object.freeze({
      ultrawork: modes.ultrawork,
      team: modes.team,
      hyperplan: modes.hyperplan,
      hyperplanUltrawork: modes.hyperplanUltrawork,
    }),
    skills: Object.freeze({ library: options.skills.library }),
    rules: Object.freeze({
      enabled: options.rules.enabled,
      roots: Object.freeze([...options.rules.roots]),
      maxRules: options.rules.maxRules,
      maxBytes: options.rules.maxBytes,
      loaded: Object.freeze([...(input.rules?.loaded ?? [])]),
      injected: Object.freeze([...(input.rules?.injected ?? [])]),
    }),
    commentChecker: Object.freeze({
      enabled: options.commentChecker.enabled,
      tools: Object.freeze([...options.commentChecker.tools]),
      maxWarnings: options.commentChecker.maxWarnings,
      warningsDelivered: input.commentWarnings,
    }),
    config: Object.freeze({
      rowKeys: Object.freeze([...input.config.rowKeys]),
      files: Object.freeze([...input.config.files]),
      layers: Object.freeze(
        input.config.layers.map((layer) => Object.freeze({ file: layer.file, keys: Object.freeze(Object.keys(layer.config).sort()) })),
      ),
    }),
    modelRouting: Object.freeze({
      note: "The Harness selects the session model per session; this bundle and its agent presets cannot carry model routing.",
    }),
  })
}

/**
 * The Host requires every tool to carry a stable model-facing name, a JSON
 * Parameter schema, and an output renderer; this factory keeps that contract in
 * one place while the caller supplies where the status comes from.
 *
 * @param {(exec: { agent?: { session?: unknown } }) => Promise<object>} readStatus - resolves the status for the calling session.
 * @returns {{ name: string, description: string, parameters: object, output: object, execute: (args: unknown, exec: object) => Promise<object> }} tool definition.
 */
export function createStatusTool(readStatus) {
  return Object.freeze({
    name: STATUS_TOOL_NAME,
    description: STATUS_DESCRIPTION,
    parameters: Object.freeze({ type: "object", properties: {}, additionalProperties: false }),
    output: Object.freeze({
      schema: Object.freeze({ type: "object", additionalProperties: true }),
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }],
    }),
    async execute(_args, exec) {
      return await readStatus(exec)
    },
  })
}
