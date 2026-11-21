# Installation

See the [installation guide](install.md) for the plugins supported by the `feat/deepseek-harness` branch.

## Codex plugin

For the published upstream Codex-only edition, use `npx lazycodex-ai install`. That npm command does not install this fork's OpenCode or DeepSeek Harness plugins.

The retained LazyCodex installer enables `omo@sisyphuslabs` in the Codex home. By default it links these component commands into `~/.local/bin`:

- `omo-comment-checker`, `omo-git-bash-hook`, `lazycodex-executor-verify`, `omo-lsp`, `omo-rules`, and `omo-telemetry`
- `omo-ulw-execute-continuation`, `omo-ulw-loop`, `ulw`, `ulw-loop`, and `omo-ultrawork`

The managed roles below are installed as `~/.codex/agents/{role}.toml` by default:

- `lazycodex-clone-fidelity-reviewer`, `lazycodex-code-reviewer`, `lazycodex-gate-reviewer`, and `lazycodex-qa-executor`
- `lazycodex-worker-high`, `lazycodex-worker-low`, and `lazycodex-worker-medium`
