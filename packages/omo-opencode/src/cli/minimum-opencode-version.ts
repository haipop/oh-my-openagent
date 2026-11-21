export const VERIFIED_OPENCODE_VERSION = "2.3.2"

export function getUnsupportedOpenCodeVersionMessage(openCodeVersion: string | null): string | null {
  if (!openCodeVersion) {
    return `Could not determine the OpenCode version. This branch only supports the V2 plugin on OpenCode ${VERIFIED_OPENCODE_VERSION}.`
  }

  if (openCodeVersion.replace(/^v/, "") === VERIFIED_OPENCODE_VERSION) {
    return null
  }

  return `OpenCode ${openCodeVersion} is not supported by this branch. Use OpenCode ${VERIFIED_OPENCODE_VERSION} (V2).`
}
