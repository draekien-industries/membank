# @membank/cli

CLI and npx entrypoint for membank. Manages memories from the terminal and starts the MCP server for LLM harnesses.

## Install

```bash
npm install -g @membank/cli
```

Or use without installing:

```bash
npx @membank/cli <command>
```

## Setup

Run once to configure your LLM harness:

```bash
membank setup
```

This auto-detects installed harnesses (Claude Code, Codex, OpenCode), writes MCP server config, installs session hooks, and downloads the embedding model (~33 MB).

Options:

```
--harness <name>   Target a specific harness instead of auto-detecting
--yes              Skip confirmation prompts
--dry-run          Preview changes without writing files
--json             Machine-readable output
```

Supported harnesses: `claude-code`, `codex`, `opencode` (see `membank setup` for harness-specific setup instructions)

### `membank setup upgrade`

Migrate existing harness configs from the old `npx @membank/cli --mcp` pattern to the standalone `npx @membank/mcp` binary:

```bash
membank setup upgrade
```

Run this once after upgrading to align all configured harnesses with the new standalone MCP package.

## Commands

### `membank query <text>`

Semantic search over stored memories.

```bash
membank query "how to run pnpm in one package"
membank query "auth decisions" --type decision --limit 5
```

Options: `--type <type>`, `--limit <n>` (default 10), `--include-pinned`

### `membank add <content>`

Save a new memory.

```bash
membank add "Use --filter flag for scoped pnpm commands" --type preference --tags "pnpm,monorepo"
```

Required: `--type <type>`  
Options: `--tags <a,b,c>`, `--global`

### `membank list`

List stored memories.

```bash
membank list
membank list --type correction
membank list --pinned
```

Options: `--type <type>`, `--pinned`

### `membank stats`

Show memory counts by type.

```bash
membank stats
```

### `membank pin <id>` / `membank unpin <id>`

Pin a memory so it's always injected at session start.

```bash
membank pin abc123
membank unpin abc123
```

### `membank delete <id>`

Delete a memory. Prompts for confirmation unless `--yes` is passed.

```bash
membank delete abc123
membank delete abc123 --yes
```

### `membank export`

Export all memories to a JSON file.

```bash
membank export
membank export --output my-backup.json
```

Default filename: `membank-export-<timestamp>.json`

### `membank import <file>`

Import memories from an export file.

```bash
membank import membank-export-2025-01-01.json
membank import membank-export-2025-01-01.json --yes
```

### `membank review`

List memories flagged for deduplication review, or dismiss review events.

```bash
membank review
membank review --resolve <id>
```

### `membank migrate <mode> [name]`

List or run named data migrations.

```bash
membank migrate list
membank migrate run <name>
```

### `membank config`

Read and write config values.

```bash
membank config get <key>
membank config set <key> <value>
membank config show
```

### `membank synthesize`

View and manage memory synthesis.

```bash
membank synthesize run               # trigger a synthesis run for a scope
membank synthesize show              # current synthesis for global scope
membank synthesize show --scope <s>  # synthesis for a specific project scope
membank synthesize status            # all scopes and their synthesis state
```

Options for `run` and `show`: `--scope <scope>`

### `membank activity`

List activity events for the current project.

```bash
membank activity
membank activity --type memory.created
membank activity --since 2025-01-01
membank activity --global
```

Options: `--type <event_type>` (memory.created|updated|deleted|flagged|queried), `--since <date>`, `--memory-id <id>`, `--limit <n>` (default 50), `--global`, `--scope <hash>`

### `membank inject`

Output session context formatted for a harness. Called automatically by session hooks — you don't normally run this directly.

```bash
membank inject --harness claude-code
membank inject --harness claude-code --event user-prompt-submit
membank inject --harness claude-code --event session-stop
```

Options: `--harness <name>` (claude-code|codex|opencode), `--event <event>` (session-start|user-prompt-submit|session-stop)

### `membank dashboard` (deprecated)

The dashboard is now a standalone package. Run it directly:

```bash
npx @membank/dashboard
```

See [`@membank/dashboard`](../dashboard/README.md) for options.

## Global flags

```
--json     Output machine-readable JSON
--yes, -y  Skip confirmation prompts
--mcp      Start MCP stdio server (deprecated — use npx @membank/mcp)
```

## MCP server mode

The preferred way to run the MCP server is via the standalone package:

```bash
npx @membank/mcp
```

`membank setup` writes this command into harness configs automatically. The legacy `membank --mcp` flag still works but emits a deprecation warning. Run `membank setup upgrade` to migrate existing harness configs.

## Session hooks

`setup` installs hooks for each supported harness:

- **claude-code** — SessionStart + SessionEnd hooks in `~/.claude/settings.json`
- **copilot** — MCP server config only; Copilot CLI hooks do not support context injection
- **codex** — SessionStart + UserPromptSubmit hooks in `~/.codex/hooks.json`
- **opencode** — `experimental.chat.system.transform` plugin at `~/.config/opencode/plugins/membank.js`

## Requirements

- Node.js >=24
