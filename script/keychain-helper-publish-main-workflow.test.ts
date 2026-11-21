import { describe, expect, test } from "bun:test"
import { KEYCHAIN_HELPER_RELEASE_ASSET } from "./release-keychain-helper-target"
import { jobSteps, publishWorkflow, stepAt } from "./keychain-helper-workflow.test-support"

describe("signed keychain helper release asset", () => {
  test("publishes the signed helper with an explicit checksum, not a standalone payload", () => {
    const steps = jobSteps(publishWorkflow, "release")
    const download = stepAt(steps, "Download signed keychain helper asset")
    const upload = stepAt(steps, "Upload release assets")
    const verify = stepAt(steps, "Verify uploaded assets")
    const publishingAssets = "inputs.skip_platform != true && inputs.lazycodex_only != true"

    expect(download.index).toBeLessThan(upload.index)
    expect(upload.index).toBeLessThan(verify.index)
    expect(download.value.if).toBe(publishingAssets)
    expect(upload.value.if).toBe(publishingAssets)
    expect(download.value.with).toMatchObject({
      name: "release-binary-omo-keychain",
      path: ".omo/release-binaries",
    })
    expect(upload.value.run).toContain(`shasum -a 256 ${KEYCHAIN_HELPER_RELEASE_ASSET} > SHA256SUMS`)
    expect(upload.value.run).toContain(`"$ASSETS/${KEYCHAIN_HELPER_RELEASE_ASSET}" "$ASSETS/SHA256SUMS"`)
    expect(upload.value.run).not.toContain("omo-*")
    expect(verify.value.if).toBe("inputs.lazycodex_only != true")
    expect(verify.value.run).toContain("shasum -a 256 -c SHA256SUMS")
  })

  test("the npm publish job does not assemble or restore an omo-ai payload", () => {
    const names = jobSteps(publishWorkflow, "publish-main").map(({ name }) => name ?? "")
    expect(names.filter((name) => /omo-ai|keychain helper/i.test(name))).toEqual([])
  })
})
