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

This auto-detects installed harnesses (Claude Code, GitHub Copilot CLI, Codex, OpenCode), writes MCP server config, installs session hooks, and downloads the embedding model (~33 MB).

Options:

```
--harness <name>   Target a specific harness instead of auto-detecting
--yes              Skip confirmation prompts
--dry-run          Preview changes without writing files
--json             Machine-readable output
```

Supported harnesses: `claude-code`, `copilot`, `codex`, `opencode`

## Commands

### `membank query <text>`

Semantic search over stored memories.

```bash
membank query "how to run pnpm in one package"
membank query "auth decisions" --type decision --limit 5
```

Options: `--type <type>`, `--limit <n>` (default 10)

### `membank add <content>`

Save a new memory.

```bash
membank add "Use --filter flag for scoped pnpm commands" --type preference --tags "pnpm,monorepo"
```

Required: `--type <type>`  
Options: `--tags <a,b,c>`, `--scope <scope>`

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

### `membank inject`

Output session context formatted for a harness. Called automatically by session hooks — you don't normally run this directly.

```bash
membank inject --harness claude-code --scope <project-scope>
```

## Global flags

```
--json     Output machine-readable JSON
--yes, -y  Skip confirmation prompts
--mcp      Start MCP stdio server (used by harness config)
```

## MCP server mode

```bash
membank --mcp
```

Starts the stdio MCP server. This is what harnesses connect to — `setup` writes this command into harness configs automatically.

## Session hooks

`setup` installs two hooks:

**Session start** — calls `membank inject` to prepend pinned memories into the LLM context at the beginning of every session.

**Session stop (Claude Code only)** — prompts the LLM to review the session and call `save_memory` for any notable corrections, preferences, or decisions.

## Requirements

- Node.js >=24
