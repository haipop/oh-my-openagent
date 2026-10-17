# Coding Agent Sessions

Use this directive when asked to find, read, reconstruct, or compare past coding-agent sessions,
transcripts, or subagent runs: what an earlier session did, why a file changed, what a delegated agent
reported, or which sessions touched a path.

## What Exists Locally

Each harness keeps its own log format. Inspect the real layout before assuming:

| Harness | Usual location | Shape |
|---|---|---|
| DeepSeek Harness | `~/.dsh/sessions/<slug>/<session-id>/session.v4.jsonl.zstd` | zstd-compressed JSONL; decompress with `Bun.zstdDecompressSync` or `zstd -d` |
| Codex | `~/.codex/sessions/**.jsonl` | JSONL rollouts with event envelopes |
| Claude Code | `~/.claude/projects/<project>/<session>.jsonl` | JSONL messages |
| OpenCode | its own SQLite database under the user data dir | query with the harness CLI or `sqlite3`, never by copying the DB |
| OMO / Senpi | `~/.omo`, `~/.senpi` runtime dirs | mixed JSON / JSONL state |

Never modify these stores. Read-only access: `ls`, `grep`, `sed -n`, or a copy under `/tmp`.

## Find

1. Locate candidates by path and time: `ls -lt ~/.dsh/sessions/*/*/`, `find ~/.codex/sessions -name '*.jsonl' -newermt '-7 days'`.
2. Narrow by workspace first (the slug encodes the session directory), then by session title or first
   human message.
3. Search content with `grep -l` across candidate files, then read the matching file with line numbers.

## Read

- Decompress a DSH session into `/tmp` before reading: it is zstd, not plain text.
- Follow the event stream in order: user message, assistant message, tool call, tool result. Tool
  results carry the evidence; the assistant's summary does not replace them.
- Keep the session id in every claim: "session `<id>` seq 42 shows ...".

## Reconstruct

A reconstruction answers three questions:

1. What did the user ask, in their words (quote the prompt)?
2. What did the agent change, verified by tool calls or diffs, not by its own summary?
3. What is the current state of the working tree relative to that session?

When the session is not local (another machine, another user), say so and name what evidence would be
required instead of inventing a transcript.

## Spawning Is a Different Task

Reading past sessions is read-only. Starting a new agent session in another harness is a side effect:
isolate it (temporary home directory or profile flag), never point it at the user's live config, and
capture the transcript it writes. Only spawn when the user asked for it.

## Report

Cite session id, file path, and sequence or line number for each finding. Separate what the log proves
from what you infer. If a session is unreadable or the format is unknown, report that instead of a
summary.
