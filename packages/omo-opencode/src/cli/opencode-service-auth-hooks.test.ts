import { describe, expect, test } from "bun:test"
import { openCodeServiceAuthHooks } from "./cli-program"
import { openCodeDeviceServiceHandoff } from "./service-auth/cli-service-auth-hooks"

describe("OpenCode CLI service auth", () => {
  test("#given the OpenCode CLI #when login is configured #then it uses the same device-service hooks as omo login", () => {
    expect(openCodeServiceAuthHooks().deviceService).toBe(openCodeDeviceServiceHandoff)
  })
})
