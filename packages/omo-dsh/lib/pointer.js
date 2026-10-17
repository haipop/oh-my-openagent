/**
 * Injected mode pointers and the synthetic messages that carry them.
 *
 * A pointer stays compact on purpose: it must fit one injected message and it
 * must not duplicate a full directive, which is registered as a uniquely named
 * runtime skill and loaded on demand through the `skill` tool.
 *
 * @module @oh-my-opencode/omo-dsh/pointer
 */

import { HYPERPLAN_SKILL_NAME, ULTRAWORK_SKILL_NAME } from "./skill.js"

/** Source kind recorded on the synthetic message; it is how the harness log marks the injection. */
export const ULTRAWORK_SOURCE_KIND = "omo-ultrawork"

/** Source kind for team-mode injections. */
export const TEAM_SOURCE_KIND = "omo-team"

/** Source kind for hyperplan-mode injections. */
export const HYPERPLAN_SOURCE_KIND = "omo-hyperplan"

/** Source kind for the combined hyperplan+ultrawork injection. */
export const HYPERPLAN_ULTRAWORK_SOURCE_KIND = "omo-hyperplan-ultrawork"

/** Opening tag of the injected bootstrap; also used for duplicate detection. */
export const ULTRAWORK_POINTER_MARKER = "<ultrawork-mode>"

/**
 * Render the three-step ultrawork bootstrap.
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
 * Render the team-mode bootstrap onto the native DeepSeek Harness Agent Teams.
 *
 * @returns {string} the pointer text, wrapped in its marker tags.
 */
export function buildTeamPointer() {
  return [
    "<team-mode>",
    "**MANDATORY** - the user invoked team mode. Before task work:",
    "",
    "1. Make the first user-visible line of this turn exactly: `TEAM MODE ENABLED!`",
    "2. Plan the board, then create the shared tasks with `team_task_create` (one task per work item, each with a disjoint write scope and a self-contained brief).",
    "3. Spawn one durable member per role with `spawn_teammate` (fresh context: `context: \"fresh\"` unless the member truly needs this conversation). Keep concurrent members modest.",
    "4. Coordinate through `send_message`, collect with `wait_agent`, inspect with `list_agents`, and stop a member with `interrupt_agent`. Do not replace a coordinated team with plain `subagent` calls when the user asked for team mode.",
    "5. Before finishing: mark every task terminal with `team_task_update`, interrupt idle members, and report the final board state.",
    "",
    "If the Agent Teams tools are absent in this profile, say so in one line and continue with the available delegation tools.",
    "</team-mode>",
  ].join("\n")
}

/**
 * Render the hyperplan bootstrap that loads the adversarial planning directive.
 *
 * @param {{ skillName?: string }} [input] - name of the registered directive skill.
 * @returns {string} the pointer text, wrapped in its marker tags.
 */
export function buildHyperplanPointer(input = {}) {
  const skillName = input.skillName ?? HYPERPLAN_SKILL_NAME
  return [
    "<hyperplan-mode>",
    "**MANDATORY** - the user invoked hyperplan mode.",
    "",
    "1. Make the first user-visible line of this turn exactly: `HYPERPLAN MODE ENABLED!`",
    `2. Call the \`skill\` tool with \`name: "${skillName}"\` and follow the returned adversarial planning workflow in full.`,
    "3. Do not improvise the rounds, do not write the plan yourself, and do not present a plan before the adversarial team has run the required rounds.",
    "",
    "If the skill tool fails, say so in one line and continue with the user's request.",
    "</hyperplan-mode>",
  ].join("\n")
}

/**
 * Render the combined hyperplan+ultrawork bootstrap.
 *
 * @param {{ ultraworkSkillName?: string, hyperplanSkillName?: string }} [input] - registered skill names.
 * @returns {string} the pointer text, wrapped in its marker tags.
 */
export function buildHyperplanUltraworkPointer(input = {}) {
  const ultraworkSkillName = input.ultraworkSkillName ?? ULTRAWORK_SKILL_NAME
  const hyperplanSkillName = input.hyperplanSkillName ?? HYPERPLAN_SKILL_NAME
  return [
    "<hyperplan-ultrawork-mode>",
    "**MANDATORY** - the user invoked hyperplan and ultrawork together.",
    "",
    "1. Make the first user-visible line of this turn exactly: `HYPERPLAN ULTRAWORK MODE ENABLED!` and do NOT also emit the standalone hyperplan or ultrawork banners.",
    `2. Call the \`skill\` tool with \`name: "${hyperplanSkillName}"\` and start the adversarial planning workflow.`,
    `3. Then call the \`skill\` tool with \`name: "${ultraworkSkillName}"\` and use it as the execution discipline after planning: register the goal, execute, verify on the real surface, and report evidence.`,
    "4. Order matters: adversarial planning first, execution discipline second.",
    "</hyperplan-ultrawork-mode>",
  ].join("\n")
}

/**
 * Build one identified, frozen synthetic mode message.
 *
 * The harness validates a user message structurally: a non-empty string id, the
 * `user` role, an array of content blocks, and a source object with a string
 * kind. The message is deep-frozen the way first-party producers freeze theirs.
 *
 * @param {{ id: string, pointer: string, kind: string, summary: string }} input - identity, text, and source metadata.
 * @returns {Readonly<{ id: string, role: "user", content: readonly { type: "text", text: string }[], source: Readonly<{ kind: string, form: "notice", summary: string }> }>} frozen message.
 */
export function createModeMessage(input) {
  return Object.freeze({
    id: input.id,
    role: "user",
    content: Object.freeze([Object.freeze({ type: "text", text: input.pointer })]),
    source: Object.freeze({
      kind: input.kind,
      form: "notice",
      summary: input.summary,
    }),
  })
}

/** All source kinds this bundle can inject. */
export const MODE_SOURCE_KINDS = Object.freeze([
  ULTRAWORK_SOURCE_KIND,
  TEAM_SOURCE_KIND,
  HYPERPLAN_SOURCE_KIND,
  HYPERPLAN_ULTRAWORK_SOURCE_KIND,
])

/**
 * Whether a message is one this bundle injected.
 *
 * @param {{ source?: { kind?: string } } | undefined} message - session message.
 * @returns {boolean} true for an injection of this bundle.
 */
export function isModeMessage(message) {
  return MODE_SOURCE_KINDS.includes(message?.source?.kind)
}

/** @deprecated kept for older call sites and tests; same as {@link isModeMessage} for ultrawork only. */
export function isUltraworkMessage(message) {
  return message?.source?.kind === ULTRAWORK_SOURCE_KIND
}

/** @deprecated use {@link createModeMessage}. */
export function createUltraworkMessage(input) {
  return createModeMessage({
    id: input.id,
    pointer: input.pointer,
    kind: ULTRAWORK_SOURCE_KIND,
    summary: "ultrawork mode activated",
  })
}
