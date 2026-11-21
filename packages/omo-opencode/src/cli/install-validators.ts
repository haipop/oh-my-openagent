import color from "picocolors"
import type { InstallArgs } from "./types"

export const SYMBOLS = {
  check: color.green("[OK]"),
  cross: color.red("[X]"),
  arrow: color.cyan("->"),
  bullet: color.dim("*"),
  info: color.blue("[i]"),
  warn: color.yellow("[!]"),
  star: color.yellow("*"),
}

const ANSI_COLOR_PATTERN = new RegExp("\u001b\\[[0-9;]*m", "g")

export function printHeader(isUpdate: boolean): void {
  const mode = isUpdate ? "Update" : "Install"
  console.log()
  console.log(color.bgMagenta(color.white(` oMoMoMoMo... ${mode} `)))
  console.log()
}

export function printSuccess(message: string): void {
  console.log(`${SYMBOLS.check} ${message}`)
}

export function printError(message: string): void {
  console.log(`${SYMBOLS.cross} ${color.red(message)}`)
}

export function printInfo(message: string): void {
  console.log(`${SYMBOLS.info} ${message}`)
}

export function printWarning(message: string): void {
  console.log(`${SYMBOLS.warn} ${color.yellow(message)}`)
}

export function printBox(content: string, title?: string): void {
  const lines = content.split("\n")
  const maxWidth = Math.max(...lines.map((line) => line.replace(ANSI_COLOR_PATTERN, "").length), title?.length ?? 0) + 4
  const border = color.dim("─".repeat(maxWidth))

  console.log()
  if (title) {
    console.log(
      color.dim("┌─") + color.bold(` ${title} `) + color.dim("─".repeat(maxWidth - title.length - 4)) + color.dim("┐"),
    )
  } else {
    console.log(color.dim("┌") + border + color.dim("┐"))
  }

  for (const line of lines) {
    const stripped = line.replace(ANSI_COLOR_PATTERN, "")
    const padding = maxWidth - stripped.length
    console.log(color.dim("│") + ` ${line}${" ".repeat(padding - 1)}` + color.dim("│"))
  }

  console.log(color.dim("└") + border + color.dim("┘"))
  console.log()
}

const RETIRED_OPENCODE_FLAGS = [
  ["claude", "--claude"],
  ["openai", "--openai"],
  ["gemini", "--gemini"],
  ["copilot", "--copilot"],
  ["opencodeZen", "--opencode-zen"],
  ["zaiCodingPlan", "--zai-coding-plan"],
  ["kimiForCoding", "--kimi-for-coding"],
  ["opencodeGo", "--opencode-go"],
  ["bailianCodingPlan", "--bailian-coding-plan"],
  ["minimaxCnCodingPlan", "--minimax-cn-coding-plan"],
  ["minimaxCodingPlan", "--minimax-coding-plan"],
  ["vercelAiGateway", "--vercel-ai-gateway"],
] as const satisfies readonly (readonly [keyof InstallArgs, string])[]

export function validateNonTuiArgs(args: InstallArgs): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (args.platform !== "codex") errors.push("Only --platform=codex is active")

  for (const [key, flag] of RETIRED_OPENCODE_FLAGS) {
    if (args[key] !== undefined) errors.push(`${flag} is retired with the OpenCode V1 installer`)
  }

  return { valid: errors.length === 0, errors }
}
