import * as Plugin from "@opencode/plugin/promise/plugin"
import { validatePluginConfig } from "../config/validate"
import { registerHashline } from "./hashline"
import { markAdmittedPrompt } from "./session-mode"
import { createOmoStatusTool } from "./status-tool"
import { injectUltraworkContext } from "./ultrawork-context"

export const opencodeV2Server = Plugin.define({
  id: "oh-my-openagent",
  async setup(context) {
    const { config } = validatePluginConfig(context.location.directory)
    await context.session.hook("prompt", (event) => {
      markAdmittedPrompt(event)
    })

    await context.session.hook("context", (event) => {
      injectUltraworkContext(event)
    })

    if (config.hashline_edit) {
      await registerHashline(context, !config.disabled_hooks?.includes("hashline-read-enhancer"))
    }

    await context.tool.transform((editor) => {
      editor.add(createOmoStatusTool(context.session))
    })
    await context.tool.reload()
  },
})
