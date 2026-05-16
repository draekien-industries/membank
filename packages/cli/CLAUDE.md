# @membank/cli

CLI + npx entrypoint for Membank.

## Commands

`query`, `add`, `list`, `pin`, `unpin`, `delete`, `stats`, `export`, `import`, `setup`, `review`, `migrate`, `config`, `synthesize`, `inject`

## setup

Auto-detects installed harnesses and writes MCP config. `--harness <name>` to target specific. `--yes` / `--json` for non-interactive use.

`setup upgrade` migrates existing harness configs from the old `npx @membank/cli --mcp` pattern to the standalone `npx @membank/mcp`.

## Deprecations

`dashboard` command is deprecated — users should run `npx @membank/dashboard` directly. `--mcp` flag still works but emits a deprecation warning; prefer `npx @membank/mcp`.
