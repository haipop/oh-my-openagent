/**
 * The injected bootstrap pointer and the synthetic user message that carries it.
 *
 * The pointer stays compact on purpose: it must fit a single injected message
 * (the Codex adapter keeps its equivalent under 4096 bytes) and it must not
 * duplicate the full directive, which is registered as a uniquely named runtime
 * skill and loaded on demand through the `skill` tool.
 *
 * @module @oh-my-opencode/omo-dsh/pointer
 */

import { ULTRAWORK_SKILL_NAME } from "./skill.js"

/** Source kind recorded on the synthetic message; it is how the harness log marks the injection. */
export const ULTRAWORK_SOURCE_KIND = "omo-ultrawork"

/** Opening tag of the injected bootstrap; also used for duplicate detection. */
export const ULTRAWORK_POINTER_MARKER = "<ultrawork-mode>"

/**
 * Render the three-step bootstrap the model must finish before starting the task.
 *
 * @param {{ skillName?: string }} [input] - name of the registered directive skill.
 * @returns {string} the pointer text, wrapped in its marker tags.
 */
export function buildUltraworkPointer(input = {}) {
  const skillName = input.skillName ?? ULTRAWORK_SKILL_NAME
  return [
    "<ultrawork-mode>",
    "**MANDATORY** - the user invoked ultrawork. Complete this bootstrap before any other work, in this order:",
    "",
    "1. Make the first user-visible line of this turn exactly: `ULTRAWORK MODE ENABLED!`",
    "2. Call `get_goal`. If an active goal already covers this task, continue it; otherwise call `create_goal` with only `objective` (no invented budgets, deadlines, or status).",
    `3. Call the \`skill\` tool with \`name: "${skillName}"\` and follow the returned directive in full. If the skill tool fails, say so in one line and continue with steps 1-2.`,
    "",
    "Do not start the user's task before steps 1-3 are done. Do not ask whether to proceed: ultrawork means execute, verify on the real surface, and report evidence.",
    "</ultrawork-mode>",
  ].join("\n")
}

/**
 * Build the identified, frozen synthetic message that enters the step.
 *
 * The harness validates a user message structurally: a non-empty string id, the
 * `user` role, an array of content blocks, and a source object with a string
 * kind. The message is deep-frozen the way first-party producers freeze theirs.
 *
 * @param {{ id: string, pointer: string }} input - message identity and pointer text.
 * @returns {Readonly<{ id: string, role: "user", content: readonly { type: "text", text: string }[], source: Readonly<{ kind: string, form: "notice", summary: string }> }>} frozen message.
 */
export function createUltraworkMessage(input) {
  return Object.freeze({
    id: input.id,
    role: "user",
    content: Object.freeze([Object.freeze({ type: "text", text: input.pointer })]),
    source: Object.freeze({
      kind: ULTRAWORK_SOURCE_KIND,
      form: "notice",
      summary: "ultrawork mode activated",
    }),
  })
}

/**
 * Whether a message is the one this plugin injected.
 *
 * @param {{ source?: { kind?: string } } | undefined} message - session message.
 * @returns {boolean} true for an injection of this plugin.
 */
export function isUltraworkMessage(message) {
  return message?.source?.kind === ULTRAWORK_SOURCE_KIND
}
