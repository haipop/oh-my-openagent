import { cliDeviceServiceHandoff } from "./device-service-handoff"
import { installCliServiceAuthHooks } from "./cli-service-auth-state"

export const openCodeDeviceServiceHandoff = (api: string) =>
  cliDeviceServiceHandoff({ api, log: (line) => process.stderr.write(`${line}\n`) })

installCliServiceAuthHooks({
  deviceService: openCodeDeviceServiceHandoff,
})
