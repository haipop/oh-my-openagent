# LSP Setup

Use this directive when the user wants language-server capabilities in DeepSeek Harness (diagnostics,
go-to-definition, references, symbols, rename) or hits a "no LSP server" style gap.

DeepSeek Harness has no built-in LSP plugin. The capability comes from the repository's own stdio MCP
server, `packages/lsp-tools-mcp`, registered through the Harness MCP client. This directive is the
wiring procedure, not a wish.

## 1. Check What Is Already There

```bash
# any LSP tools already exposed by the Host?
command -v node && node --version
```

If the session already lists `mcp__lsp__*` tools, stop: the wiring exists. Otherwise continue.

## 2. Build the MCP Server

Run from the repository checkout that contains `packages/lsp-tools-mcp`:

```bash
cd packages/lsp-tools-mcp
npm ci
npm run build
ls dist/cli.js
```

The server is Node-targeted, so `npm` is correct here even when the rest of the repository uses Bun.
The build creates `dist/cli.js`; that file is the stdio entry point (`node dist/cli.js mcp`).

Verify the server speaks MCP before wiring it:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node dist/cli.js mcp
```

Expect one `initialize` result with `serverInfo.name: "lsp"` and a `tools/list` result listing the raw
tool names (`status`, `diagnostics`, `goto_definition`, `find_references`, `symbols`,
`prepare_rename`, `rename`). If it hangs or prints nothing, fix the build before touching a profile.

## 3. Register It on a Profile

The Harness MCP client is `@deepseek-ai/dsh-mcp-client`; one row per server. Add it to the profile
patch (`~/.dsh/profiles/<profile>/cordis.patch.yml`), never to a bundle you do not own:

```yaml
- insert:
    - id: mcp-lsp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: lsp
        transport: stdio
        command: node
        args:
          - /absolute/path/to/packages/lsp-tools-mcp/dist/cli.js
          - mcp
        toolCallTimeoutMs: 60000
        failOnStartupError: false
```

Rules:

- `serverName` is the tool namespace: the model sees `mcp__lsp__status`, `mcp__lsp__diagnostics`, and
  so on. Keep it short and stable; renaming it renames every tool.
- The path must be absolute and must survive reboots. A checkout that moves breaks the row.
- `failOnStartupError: false` keeps the Harness booting when the server cannot start; the tools simply
  do not appear. Use `true` only when the server must be present.
- The profile patch is user-owned. Do not write into `~/.dsh/profiles/*/cordis.patch.yml` without the
  user's request; show the row and the target file first.

## 4. Language Server Prerequisites

The MCP server is a proxy: it needs a language server for the languages in play. Install the matching
server on PATH (for example `typescript-language-server` for TypeScript, `pyright` for Python,
`rust-analyzer` for Rust, `gopls` for Go) and confirm the project has the config the server expects
(`tsconfig.json`, `pyrightconfig.json`, `Cargo.toml`, `go.mod`).

Without a language server the tools still answer `status` but produce no diagnostics.

## 5. Verify End to End

1. Restart or reload the Harness until the profile patch is composed.
2. Ask the model to list its tools; the `mcp__lsp__*` names must appear.
3. Run `mcp__lsp__status`, then diagnostics on one real file with a known error.
4. Report: profile file changed, server path, raw and namespaced tool names observed, and the status
   output. If tools do not appear, read the Harness log for the MCP startup error before changing
   anything else.

## Boundaries

- Do not fabricate LSP results. If the MCP row is not mounted, say which step is missing.
- Do not install language servers globally without the user's agreement.
- Do not edit another tool's profile; this recipe targets the Harness profile only.
