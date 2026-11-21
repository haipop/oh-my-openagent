import * as Plugin from "@opencode/plugin/promise/plugin"
import { markAdmittedPrompt } from "./session-mode"
import { createOmoStatusTool } from "./status-tool"
import { injectUltraworkContext } from "./ultrawork-context"

export const opencodeV2Server = Plugin.define({
  id: "oh-my-openagent",
  async setup(context) {
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
