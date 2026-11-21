// postinstall.mjs
// Runs after npm install to verify platform binary is available

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { getPlatformPackageCandidates, getBinaryPath, resolvePlatformPackageBaseName } from "./bin/platform.js"
import { detectPlatformBinaryMismatch } from "./bin/version-mismatch.js"

const require = createRequire(import.meta.url)

const RENAME_NOTICE =
  "oh-my-openagent: the 'omo' command is now 'omo-agent-toolkit' (the old name was removed in this major release)."

/**
 * Detect libc family on Linux
 */
function getLibcFamily() {
  if (process.platform !== "linux") {
    return undefined
  }

  try {
    const detectLibc = require("detect-libc")
    return detectLibc.familySync()
  } catch {
    return null
  }
}

function readMainPackageJson() {
  try {
    return JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
  } catch {
    return null
  }
}

function getPackageBaseName() {
  const packageJson = readMainPackageJson()
  return resolvePlatformPackageBaseName(packageJson?.name || "oh-my-opencode")
}

function getMainPackageVersion() {
  const packageJson = readMainPackageJson()
  return packageJson?.version ?? null
}

function readPlatformPackageVersion(pkg) {
  try {
    const platformPackageJsonPath = require.resolve(`${pkg}/package.json`)
    const packageJson = JSON.parse(readFileSync(platformPackageJsonPath, "utf8"))
    return packageJson.version ?? null
  } catch {
    return null
  }
}

function main() {
  const { platform, arch } = process
  const libcFamily = getLibcFamily()
  const packageBaseName = getPackageBaseName()

  // npm >= 7 hides lifecycle output unless --foreground-scripts, so this notice is
  // best-effort: the reliable migration surfaces are the CHANGELOG, docs, and README.
  console.log(RENAME_NOTICE)

  try {
    const packageCandidates = getPlatformPackageCandidates({
      platform,
      arch,
      libcFamily,
      packageBaseName,
    })

    const resolvedPackage = packageCandidates.find((pkg) => {
      try {
        require.resolve(getBinaryPath(pkg, platform))
        return true
      } catch {
        return false
      }
    })

    if (!resolvedPackage) {
      throw new Error(`No platform binary package installed. Tried: ${packageCandidates.join(", ")}`)
    }

    const mismatch = detectPlatformBinaryMismatch({
      mainVersion: getMainPackageVersion(),
      platformVersion: readPlatformPackageVersion(resolvedPackage),
      platformPackage: resolvedPackage,
    })
    if (mismatch) {
      console.warn(`⚠ oh-my-opencode platform binary version mismatch detected`)
      console.warn(`  ${packageBaseName}: ${mismatch.mainVersion}`)
      console.warn(`  ${mismatch.platformPackage}: ${mismatch.platformVersion}`)
      console.warn(`  The startup banner may show the stale version until the platform binary is updated.`)
      console.warn(
        `  Fix: npm install -g ${packageBaseName}@${mismatch.mainVersion} ${mismatch.platformPackage}@${mismatch.mainVersion}`,
      )
    }

    console.log(`✓ oh-my-opencode binary installed for ${platform}-${arch} (${resolvedPackage})`)
  } catch (error) {
    console.warn(`⚠ oh-my-opencode: ${error.message}`)
    console.warn(`  The CLI may not work on this platform.`)
    // Don't fail installation - let user try anyway
  }
}

main()
