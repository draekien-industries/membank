# Membank

LLM memory management system. Stores your corrections, preferences, decisions, and learnings in a local SQLite database, queryable via semantic search. Exposed as an MCP server so any MCP-compatible LLM harness (Claude Code, Cursor, etc.) can read and write memories automatically.

## How it works

- Memories are typed (`correction` > `preference` > `decision` > `learning` > `fact`) and scoped (global or per-project)
- Embeddings run locally via `bge-small-en-v1.5` — no data leaves your machine
- Dedup via cosine similarity: >0.92 = auto-overwrite, 0.75–0.92 = flagged for review
- Project scope derived from `git remote get-url origin` hash, fallback to cwd hash
- Session injection: stats + all pinned global memories + all pinned project memories prepended to every context window
- Optional background synthesis engine compresses memories into a rolling summary, replacing pinned memory injection when enabled

## Requirements

- Node.js ≥ 24
- pnpm ≥ 10

## Quick start

```bash
npx @membank/cli setup
```

`setup` auto-detects your installed LLM harness and writes the MCP server config and injection hooks. Use `--harness <name>` to target a specific harness, `--yes` to skip prompts, `--json` for machine-readable output.

Supported harnesses: `claude-code`, `copilot`, `codex`, `opencode`.

After setup, restart your harness. Membank will start injecting memories into every session.

## CLI

```bash
membank query "preferred test framework"   # semantic search
membank add --type <type> <content>        # save a new memory
membank list                               # list all memories
membank pin <id>                           # pin (always injected)
membank unpin <id>
membank delete <id>
membank review                             # list memories flagged for dedup review
membank review --resolve <id>             # dismiss review events for a memory
membank stats                              # storage and usage stats
membank export                             # export to JSON file (--output <path> to specify)
membank import <file>                      # import from JSON export file
membank migrate list                       # list available data migrations
membank migrate run <name>                 # run a named migration
membank activity                           # list activity events for the current project
membank dashboard                          # (deprecated) use: npx @membank/dashboard
membank config get <key>                   # print a config value
membank config set <key> <value>           # set a config value
membank config show                        # print the full config
membank synthesize run                     # trigger a synthesis run for a scope
membank synthesize show                    # display current synthesis for a scope
membank synthesize show --version <n>      # show a specific archived synthesis version
membank synthesize status                  # show all scopes with synthesis status
membank synthesize history                 # list archived synthesis versions for a scope
membank synthesize diff <v1> <v2>          # line diff between two archived synthesis versions
membank synthesize revert <version>        # revert active synthesis to a previous version
membank memory history <id>               # list version history for a memory
membank memory show <id>                   # show memory content at current or specific version
membank memory diff <id> <v1> <v2>         # line diff between two memory versions
membank memory revert <id> <version>       # revert a memory to a previous version
membank projects list                      # list all projects with origin and memory count
membank projects reconcile                 # merge orphaned worktree project into its parent
membank setup                              # configure MCP server + injection hooks
membank setup upgrade                      # migrate harness configs to standalone membank-mcp
membank inject                             # output session context (called by hooks)
membank inject --harness claude-code       # format output for a specific harness
```

### Injection hooks

`setup` configures MCP servers and injection hooks for all supported harnesses. Hooks fire at session start, on each user prompt, and at session end to keep pinned memories (or synthesis) in context throughout the session.

Supported harnesses and their hook mechanisms:

| Harness | MCP config location | Session hooks |
|---------|------------------|---------------|
| `claude-code` | Managed by `claude mcp` | SessionStart, SessionEnd |
| `copilot` | `~/.copilot/mcp-config.json` | MCP server only (hooks not supported) |
| `codex` | Managed by `codex mcp` | SessionStart, UserPromptSubmit |
| `opencode` | `~/.config/opencode/opencode.json` | `experimental.chat.system.transform` plugin |

## Web dashboard

Access memories via a local web UI with browsing, searching, filtering, and editing:

```bash
npx @membank/dashboard
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

When running as an MCP server, the following tools are exposed to the LLM:

| Tool | Description |
|------|-------------|
| `query_memory` | Semantic search across stored memories. `scope` controls whether to search this project, global, or all projects. |
| `save_memory` | Store a new memory with type, tags, and scope. `scope` can target this project, global, or a named tool/skill. |
| `update_memory` | Update content, type (reclassification), or tags on an existing memory |
| `delete_memory` | Remove a memory by ID |
| `delete_many` | Delete multiple memories in one call; returns per-id status |
| `pin_memory` | Pin a memory so it is always injected into session context |
| `unpin_memory` | Unpin a memory to remove it from guaranteed session injection |
| `get_memory_summary` | Aggregate stats: total memories, counts by type, pinned count, review queue size |
| `list_flagged_memories` | List memories with unresolved dedup review events (similarity 0.75–0.92) |
| `resolve_review` | Dismiss all open review events for a memory after reviewing it |
| `resolve_many` | Resolve review events for multiple memories in one call; returns per-id status |
| `merge_memories` | Merge two or more near-duplicate memories into one, combining their content |
| `list_memory_history` | List version history for a memory (up to 10 past snapshots) |
| `list_migrations` | List available named data migrations |
| `run_migration` | Execute a named data migration |
| `list_synthesis_history` | List archived synthesis versions for a scope (up to 5 snapshots) |
| `list_projects` | List all projects with origin, memory count, and scope hash |
| `reconcile_project` | Merge one project into another; auto-detects the orphan for the current worktree when IDs are omitted |

## Memory synthesis (optional)

The synthesis engine runs in the background and compresses memories into a rolling summary per scope. When a synthesis is available, it replaces pinned memory injection in the session context.

Synthesis calls Claude Haiku via your locally installed `claude` CLI. Any of the following auth methods work:

- `claude auth login` — uses your existing Claude Code session (Pro/Max subscribers)
- `CLAUDE_CODE_OAUTH_TOKEN` — run `claude setup-token` to generate one
- `ANTHROPIC_API_KEY` — direct API billing via Anthropic Console

Enable by creating `~/.membank/config.json`:

```json
{
  "synthesis": {
    "enabled": true
  }
}
```

View synthesis state via:

```bash
membank synthesize run               # trigger synthesis for a scope
membank synthesize show              # current synthesis for global scope
membank synthesize show --scope <s>  # synthesis for a specific project scope
membank synthesize status            # all scopes and their synthesis state
membank synthesize history           # list archived synthesis versions
membank synthesize diff <v1> <v2>    # line diff between two archived versions
membank synthesize revert <version>  # revert active synthesis to a previous version
```

## Storage

All data lives at `~/.membank/`:

```
~/.membank/
  memory.db        # SQLite database (memories + vectors + synthesis)
  models/          # cached embedding model (~30 MB, downloaded on first run)
  config.json      # optional config (synthesis settings, etc.)
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
