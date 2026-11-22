# src/cli/ — Retired OpenCode V1 surface plus retained Codex and diagnostics CLI

## OVERVIEW

Commander.js CLI. Entry: `index.ts` → `runCli()` in `cli-program.ts`; runtime commands are registered by `runtime-commands.ts`.

The only active installer is `install --platform=codex` (including interactive Clack mode and `--no-tui`). OpenCode V1, `both`, `native`, and `native-dev` requests are rejected before probing or writes. The public V1 `run` command remains a no-write rejection. The explicit `config migrate` command migrates legacy settings to unified OmO configuration without loading the V1 SDK.

## COMMANDS

| Command | Purpose |
|---------|---------|
| `install` / `setup` | Install the Codex harness adapter only |
| `cleanup` / `uninstall` | Remove managed Codex Light state |
| `run` | Retired V1 launcher boundary; directs users to native `opencode run` |
| `doctor` | Read-only OpenCode diagnostics or Codex diagnostics when `--platform=codex` is selected |
| `config migrate` | Apply legacy configuration migration; `--dry-run` is read-only and `--json` emits a machine-readable report |
| `version` | Print package version |
| `mcp` | OAuth management |
| service/account commands | Service-auth surfaces owned by the separate service-auth lane |
| `refresh-model-capabilities` | Refresh the model capability cache |
| `boulder` | Inspect Boulder state |
| `worktree-sweep` | Report or remove stale linked worktrees |
| `ulw-loop` | Delegate to the Codex ulw-loop CLI |

## INSTALL BOUNDARY

`install.ts` validates arguments and delegates only the `codex` platform to `install-codex/`. `install-validators.ts` keeps retired platform spellings in its rejection matrix; `native-dev-platform-flag.ts` exposes only `codex` to Commander. Interactive selection is implemented in `tui-install-prompts.ts`; it offers only Codex and preserves the default autonomous-permission decision.

## STRUCTURE

```
cli/
├── cli-program.ts               # Commander program and retired V1 command boundaries
├── install.ts                   # Codex-only install boundary
├── cli-installer.ts             # Noninteractive Codex output
├── tui-installer.ts             # Interactive Codex installer
├── install-codex/               # Adapter over canonical omo-codex installer
├── doctor/                      # Read-only diagnostics
├── config-migrate.ts            # Explicit configuration preview and migration
├── config-manager/              # Read-only/config utility exports
├── worktree-sweep/
├── mcp-oauth/
└── runtime-commands.ts
```

Deleted `run/`, `install-native/`, `install-native-dev/`, and `get-local-version/` are intentionally not recreated: the first three are retired public paths, and local-version was an unregistered private V1 updater with an OpenCode `bun update` command.

## DOCTOR

OpenCode doctor is diagnostic only. It may inspect installed binaries and legacy configuration, but it must not advise rerunning a V1 installer, OpenCode npm update, native setup, or config migration. Codex doctor and its update guidance remain supported.
