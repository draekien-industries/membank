# @membank/cli

CLI + npx entrypoint for Membank.

## Commands

`query`, `add`, `list`, `pin`, `unpin`, `delete`, `stats`, `export`, `import`, `setup`, `doctor`, `review`, `migrate`, `config`, `synthesize`, `inject`

## doctor

Read-only health check: native Claude Code auto-memory conflict, stuck `in_flight` extraction runs,
split project scopes, and the 30-day extraction failure rate. `--fix` applies fixes, prompting
before anything irreversible. `--json` for scripting.

## setup

Auto-detects installed harnesses and writes MCP config. `--harness <name>` to target specific. `--yes` / `--json` for non-interactive use.

`setup upgrade` migrates existing harness configs from the old `npx @membank/cli --mcp` pattern to the standalone `npx @membank/mcp`.

## Deprecations

`dashboard` command is deprecated — users should run `npx @membank/dashboard` directly. `--mcp` flag still works but emits a deprecation warning; prefer `npx @membank/mcp`.
