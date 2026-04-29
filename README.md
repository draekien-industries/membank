# Membank

LLM memory management system. Stores your corrections, preferences, decisions, and learnings in a local SQLite database, queryable via semantic search. Exposed as an MCP server so any MCP-compatible LLM harness (Claude Code, Cursor, etc.) can read and write memories automatically.

## How it works

- Memories are typed (`correction` > `preference` > `decision` > `learning` > `fact`) and scoped (global or per-project)
- Embeddings run locally via `bge-small-en-v1.5` — no data leaves your machine
- Dedup via cosine similarity: >0.92 = auto-overwrite, 0.75–0.92 = flagged for review
- Project scope derived from `git remote get-url origin` hash, fallback to cwd hash
- Session injection: pinned global + pinned project memories prepended to every context window

## Requirements

- Node.js ≥ 24
- pnpm ≥ 10

## Quick start

```bash
npx @membank/cli setup
```

`setup` auto-detects your installed LLM harness and writes the MCP server config. Use `--harness <name>` to target a specific harness, `--yes` to skip prompts, `--json` for machine-readable output.

Supported harnesses: `claude-code`, `copilot-cli`, `codex`, `opencode`.

After setup, restart your harness. Membank will start injecting memories into every session.

## CLI

```bash
membank query "preferred test framework"   # semantic search
membank add                                # interactive add
membank list                               # list all memories
membank pin <id>                           # pin (always injected)
membank unpin <id>
membank delete <id>
membank stats                              # storage and usage stats
membank export > memories.json
membank import < memories.json
membank setup                              # configure MCP server + injection hooks
membank inject                             # output session context (called by hooks)
membank inject --harness claude-code       # format output for a specific harness
membank inject --scope <scope>            # override project scope (default: auto from git)
membank stop-hook --harness copilot-cli   # output session-end prompt (called by stop hooks)
```

### Injection hooks

`setup` writes two hooks into your harness config:

- **Session-start hook** — injects pinned memories into every new session context. Calls `membank inject --harness <name>`.
- **Stop hook** — prompts the LLM at session end to review the conversation and save any new preferences, corrections, or decisions. Calls `membank stop-hook --harness <name>` (or uses a native prompt hook for `claude-code`).

Supported harnesses and their hook mechanisms:

| Harness | Config file | Session-start | Stop |
|---------|-------------|---------------|------|
| `claude-code` | `~/.claude/settings.json` | `SessionStart` command hook | `Stop` prompt hook (native) |
| `copilot-cli` | `~/.copilot/settings.json` | `sessionStart` command hook | `stop` command hook |
| `codex` | `~/.codex/hooks.json` | `SessionStart` command hook | `Stop` command hook |
| `opencode` | `~/.config/opencode/plugins/membank.js` | `session.start` plugin event | `session.idle` plugin event |

## MCP tools

When running as an MCP server, five tools are exposed to the LLM:

| Tool | Description |
|------|-------------|
| `query_memory` | Semantic search across stored memories |
| `save_memory` | Store a new memory with type, tags, and scope |
| `update_memory` | Update content or metadata on an existing memory |
| `delete_memory` | Remove a memory by ID |
| `list_memory_types` | List available memory types and their priority order |

## Storage

All data lives at `~/.membank/`:

```
~/.membank/
  memory.db        # SQLite database (memories + vectors)
  models/          # cached embedding model (~30 MB, downloaded on first run)
```

## Packages

| Package | Description |
|---------|-------------|
| `@membank/core` | DB, embeddings, query engine, dedup logic |
| `@membank/mcp` | stdio MCP server |
| `@membank/cli` | CLI and npx entrypoint |

## Development

```bash
pnpm install
pnpm build          # build all packages in dependency order
pnpm dev            # watch mode
pnpm test           # run tests
pnpm typecheck      # tsc --noEmit across all packages
pnpm lint           # biome check
pnpm lint:fix       # biome check --write
```

Scoped to one package:

```bash
pnpm --filter @membank/core build
pnpm --filter @membank/cli dev
```

## License

MIT — see [LICENSE](LICENSE).
