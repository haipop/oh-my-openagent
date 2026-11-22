import type { CommandDefinition, CommandInvocation } from "@opencode/plugin/promise/command"
import type { Context } from "@opencode/plugin/promise/plugin"
import type { SkillEditor } from "@opencode/plugin/promise/skill"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import type { OhMyOpenCodeConfig } from "../config"
import { loadBuiltinCommands } from "../features/builtin-commands"
import { extractSkillTemplate } from "../features/opencode-skill-loader/skill-content"
import type { LoadedSkill } from "../features/opencode-skill-loader/types"
import { createSkillContext } from "../plugin/skill-context"

type NativeSkill = Parameters<SkillEditor["add"]>[0]

function renderCommandTemplate(template: string, input: CommandInvocation): string {
  const timestamp = new Date().toISOString()
  return template.replace(/\$ARGUMENTS|\$SESSION_ID|\$TIMESTAMP/g, (variable) => {
    if (variable === "$SESSION_ID") return input.sessionID
    if (variable === "$TIMESTAMP") return timestamp
    return input.prompt.text
  })
}

function createNativeCommand(
  context: Context,
  command: ReturnType<typeof loadBuiltinCommands>[string],
): CommandDefinition {
  return {
    name: command.name,
    description: command.description,
    async execute(input) {
      await context.session.prompt({
        ...input.prompt,
        sessionID: input.sessionID,
        text: renderCommandTemplate(command.template, input),
        delivery: input.delivery,
      })
    },
  }
}

function createNativeSkill(skill: LoadedSkill): NativeSkill {
  const path =
    skill.path ?? (skill.resolvedPath ? join(skill.resolvedPath, "SKILL.md") : fileURLToPath(import.meta.url))
  return {
    id: skill.name as NativeSkill["id"],
    name: skill.name as NativeSkill["name"],
    description: skill.definition.description,
    path: path as NativeSkill["path"],
    content: extractSkillTemplate(skill),
  }
}

export async function registerNativeCommandsAndSkills(
  context: Context,
  pluginConfig: OhMyOpenCodeConfig,
): Promise<void> {
  const commands = loadBuiltinCommands(pluginConfig.disabled_commands, {
    teamModeEnabled: pluginConfig.team_mode?.enabled ?? false,
  })
  await context.command.transform((editor) => {
    for (const command of Object.values(commands)) {
      if (command.name === "goal") continue
      editor.add(createNativeCommand(context, command))
    }
  })
  await context.command.reload()

  const { mergedSkills } = await createSkillContext({
    directory: context.location.directory,
    pluginConfig,
  })
  await context.skill.transform((editor) => {
    for (const skill of mergedSkills) {
      const nativeSkill = createNativeSkill(skill)
      if (!nativeSkill.content.trim()) continue
      if (editor.get(nativeSkill.id)) {
        editor.update(nativeSkill.id, (existing) => Object.assign(existing, nativeSkill))
      } else {
        editor.add(nativeSkill)
      }
    }
  })
  await context.skill.reload()
}
