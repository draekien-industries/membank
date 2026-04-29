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

Supported harnesses: `claude-code`, `copilot`, `codex`, `opencode`.

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
membank inject --scope <scope>             # override project scope (default: auto from git)
```

### Injection hooks

`setup` configures MCP servers for all supported harnesses. For Claude Code specifically, it also installs a SessionStart hook that injects pinned memories at the beginning of each session.

Supported harnesses and their hook mechanisms:

| Harness | MCP config location | Session hooks |
|---------|------------------|---------------|
| `claude-code` | Managed by `claude mcp` | SessionStart hook injects pinned memories |
| `copilot` | `~/.copilot/mcp-config.json` | MCP server only |
| `codex` | Managed by `codex mcp` | MCP server only |
| `opencode` | `~/.config/opencode/opencode.json` | MCP server only |

## Web dashboard

Access memories via a local web UI with browsing, searching, filtering, and editing:

```bash
pnpm dev
# Opens http://localhost:3847
```

Features:
- Browse all memories with filtering by type, scope, and pin status
- Full-text search across memory content
- Edit memory type, tags, and metadata
- Review memories flagged for deduplication
- View memory statistics and storage overview
- Dark mode support

See [`packages/dashboard/README.md`](packages/dashboard/README.md) for API docs and architecture details.

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
| `@membank/dashboard` | Web UI — browse, search, and manage memories |

## Development

```bash
pnpm install                # install workspace deps
pnpm build                  # build all packages in dependency order
pnpm dev                    # watch mode across all packages (including dashboard dev server)
pnpm typecheck              # tsc --noEmit across all packages
pnpm lint                   # biome check
pnpm lint:fix               # biome check --write
pnpm clean                  # remove all dist/ and *.tsbuildinfo
```

Scoped to one package:

```bash
pnpm --filter @membank/core build
pnpm --filter @membank/cli dev
pnpm --filter @membank/dashboard dev    # dashboard only on http://localhost:3847
```

## License

MIT — see [LICENSE](LICENSE).
