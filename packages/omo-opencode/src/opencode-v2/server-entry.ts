import * as Plugin from "@opencode/plugin/promise/plugin"
import { validatePluginConfig } from "../config/validate"
import { markAdmittedPrompt } from "./session-mode"
import { createOmoStatusTool } from "./status-tool"
import { injectUltraworkContext } from "./ultrawork-context"
import { registerWriteGuard } from "./write-guard"

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

    if (!config.disabled_hooks?.includes("write-existing-file-guard")) {
      await registerWriteGuard(context)
    }

    await context.tool.transform((editor) => {
      editor.add(createOmoStatusTool(context.session))
    })
    await context.tool.reload()
  },
})
