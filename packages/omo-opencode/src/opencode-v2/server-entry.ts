import * as Plugin from "@opencode/plugin/promise/plugin"
import { loadPluginConfig } from "../plugin-config"
import { markAdmittedPrompt } from "./session-mode"
import { registerNativeCommandsAndSkills } from "./native-commands-skills"
import { createOmoStatusTool } from "./status-tool"
import { injectUltraworkContext } from "./ultrawork-context"

export const opencodeV2Server = Plugin.define({
  id: "oh-my-openagent",
  async setup(context) {
    const pluginConfig = loadPluginConfig(context.location.directory, context)
    await registerNativeCommandsAndSkills(context, pluginConfig)

    await context.session.hook("prompt", (event) => {
      markAdmittedPrompt(event)
    })

    await context.session.hook("context", (event) => {
      injectUltraworkContext(event)
    })

    await context.tool.transform((editor) => {
      editor.add(createOmoStatusTool(context.session))
    })
    await context.tool.reload()
  },
})
