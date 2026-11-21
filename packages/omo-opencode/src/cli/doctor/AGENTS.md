# src/cli/doctor/ — Read-only OpenCode and retained Codex diagnostics

## OVERVIEW

`getAllCheckDefinitions()` registers browser-provider, System, Config, deprecated-reasoning-keys, Tools, Models, Telemetry, and Team Mode checks. `getCodexCheckDefinitions()` registers Codex, Codex components, and the Codex runtime-wrapper checks.

The legacy TUI plugin-config check and automatic `tui.json` repair are retired. OpenCode checks may report stale files or deprecated keys, but fixes must be manual/read-only and must not recommend the retired V1 installer, native installer, OpenCode npm update, or `config migrate`.

`latest-version.ts` performs an OpenCode dist-tag lookup only as diagnostic context and emits no OpenCode update command. Codex latest-version lookup and its `npx lazycodex-ai install` repair remain active.

## EXECUTION FLOW

```
doctor command
  → runner.ts: parallel checks with a 30-second per-check timeout
  → formatter.ts: text, status, or JSON output
  → exit code 0 on success, 1 otherwise
```

## FILES

| File | Purpose |
|------|---------|
| `checks/index.ts` | Check registration |
| `checks/system.ts` | OpenCode binary/plugin/version diagnostics |
| `checks/config.ts` | Config aggregation |
| `checks/legacy-config-leftovers.ts` | Read-only stale legacy config discovery |
| `checks/deprecated-reasoning-keys.ts` | Read-only deprecated key reporting |
| `checks/codex*.ts` | Retained Codex diagnostics |
| `latest-version.ts` | Diagnostic dist-tag lookup; update guidance for Codex only |
| `framework/` | Shared types, constants, and formatting |

To add a check, export an async `DoctorCheck`, register it in `checks/index.ts`, return `CheckResult` without throwing, and add stable IDs/names when appropriate.
