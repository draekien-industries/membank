# Membank — Vision & Architecture

LLM memory management system. Lightweight, fast, cross-harness compatible. Enables LLMs to store and retrieve persistent context about users — preferences, corrections, decisions, learnings — across sessions and coding harnesses.

## Problem

Existing LLM memory (e.g. markdown files) suffers from:

1. **Context bloat** — injecting whole files dumps too many tokens into context
2. **Query imprecision** — fuzzy text matching returns wrong or irrelevant memories
3. **Retrieval speed** — scanning files to find relevant memories is slow
4. **Schema drift** — no enforcement, memory quality degrades over time

## Target Harnesses

- Claude Code
- GitHub Copilot
- OpenAI Codex
- opencode
- Any MCP-compatible harness

---

## Architecture Decisions

### Runtime & Tooling

- **Language:** TypeScript (latest)
- **Monorepo:** Turborepo
- **Distribution:** npm — `npx membank` for zero-install CLI usage

### Storage

- **Database:** SQLite via `better-sqlite3`, single file at `~/.membank/memory.db`
- **Vector search:** `sqlite-vec` WASM extension — no native deps, no external server
- **Embeddings:** `bge-small-en-v1.5` (~33MB ONNX) via Transformers.js, CPU-only, cached at `~/.membank/models/`
- **Model download:** happens once during `membank setup`, never silently mid-session

### Project Scoping

- One DB for all projects, scoped via a `scope` column
- Scope value derived from `git remote get-url origin` → hashed; fallback to cwd hash
- Enables cross-project stats and global memories alongside per-project memories

### Memory Schema

```sql
CREATE TABLE memories (
  id           TEXT PRIMARY KEY,
  content      TEXT NOT NULL,
  type         TEXT NOT NULL,         -- enum: see types below
  tags         TEXT,                  -- JSON array of strings
  scope        TEXT NOT NULL,         -- 'global' or project hash
  embedding    BLOB,                  -- float32 vector
  source       TEXT,                  -- which harness created this
  access_count INTEGER DEFAULT 0,
  pinned       BOOLEAN DEFAULT FALSE,
  needs_review BOOLEAN DEFAULT FALSE, -- flagged by dedup similarity check
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
```

**Memory types (enum):**

- `correction` — user explicitly told the LLM it was wrong (highest signal weight: 1.0)
- `preference` — user stylistic or workflow preference (weight: 0.8)
- `decision` — architectural or project decision (weight: 0.6)
- `learning` — something the LLM inferred about the user (weight: 0.4)
- `fact` — static factual context (weight: 0.2)

### Deduplication

On every `save_memory` call, cosine similarity is checked against existing memories of the same type and scope:

- **Similarity > 0.92** → auto-overwrite existing memory, preserve `created_at`, update `updated_at`
- **Similarity 0.75–0.92** → save proceeds, existing memory flagged `needs_review = true`
- **Similarity < 0.75** → new record created

### Confidence Scoring (for ranked retrieval)

Score computed at query time, never stored:

```
score = (type_weight × 0.4) + (access_count_norm × 0.3) + (recency_norm × 0.2) + (pinned × 0.1)
```

Used to rank results from `query_memory` and to select pinned memories for session injection.

### Session-Start Injection

At the start of every session, the following is injected into the system prompt:

1. **Stats** — memory counts by type across active scopes
2. **Pinned global memories** — all memories where `scope = 'global' AND pinned = true`
3. **Pinned project memories** — all memories where `scope = <current project> AND pinned = true`

Example:
```
[Memory Stats]: 12 preferences, 8 corrections, 3 decisions (2 projects)
[Pinned Global]: "Never use markdown tables" (correction)
[Pinned Global]: "User is a senior engineer — skip basics" (preference)
[Pinned Project: membank]: "Turborepo monorepo structure" (decision)
```

LLMs call `query_memory` for everything else — injection is deterministic and user-controlled, not algorithmic.

### Retrieval Strategy

- **Primary:** LLM-driven tool pull via `query_memory` (semantic search, called when LLM needs context)
- **Secondary:** Session-start injection of pinned memories (see above)
- No per-turn automatic injection — avoids token bloat

---

## Packages

| Package | Description |
|---|---|
| `membank` | CLI entrypoint, published to npm |
| `@membank/core` | Storage engine, embedding, query, dedup logic |
| `@membank/mcp` | stdio MCP server wrapping core |
| `@membank/dashboard` | Web UI for browsing and managing memories (future) |

---

## MCP Tools (5)

Exposed to LLMs via all compatible harnesses:

- `query_memory(query, type?, scope?, limit?)` — semantic search, returns ranked memories, increments `access_count`
- `save_memory(content, type, tags?, scope?)` — write with auto-dedup
- `update_memory(id, content, tags?)` — update existing record
- `delete_memory(id)` — remove a memory
- `list_memory_types()` — returns valid enum values (static)

---

## CLI Commands (8)

```
membank query <text> [--type] [--scope] [--limit] [--json]
membank add <content> --type <type> [--tags] [--scope] [--json]
membank list [--type] [--scope] [--pinned] [--json]
membank pin <id>
membank unpin <id>
membank delete <id> [--yes]
membank stats [--json]
membank export [--output <file>]
membank import <file> [--yes]
membank setup [--harness <name>] [--yes] [--dry-run] [--json]
```

All commands support `--yes` (skip confirmations) and `--json` (machine-readable output) for non-interactive/CI use.

### `membank setup`

Inspired by Vercel CLI UX:

1. Detects installed harnesses (Claude Code, VS Code/Copilot, Codex, opencode)
2. Downloads embedding model to `~/.membank/models/` with progress indicator
3. Writes MCP server config to each detected harness config file
4. Prints summary of all changes made
5. `--dry-run` shows changes without writing
6. `--harness <name>` bypasses detection, targets specific harness

---

## Harness Integration

Each harness gets an MCP server entry pointing to `membank`:

```json
{
  "mcpServers": {
    "membank": {
      "command": "npx",
      "args": ["membank", "--mcp"]
    }
  }
}
```

Config written to harness-specific paths:

- **Claude Code:** `~/.claude/settings.json`
- **VS Code / Copilot:** `.vscode/mcp.json`
- **Codex:** `~/.codex/config.json`
- **opencode:** `~/.config/opencode/config.json`

For harnesses without MCP support: install a SKILL that calls `npx membank inject --scope <project>` to prepend session context.

---

## Privacy & Security

- DB stored unencrypted at `~/.membank/memory.db` — same threat model as `.gitconfig`
- No data leaves the machine — embeddings run fully local, no API calls
- Encryption at rest is a v2 consideration if users request it

---

## Out of Scope (v1)

- Multi-machine sync
- DB encryption
- Dashboard (scaffolded, not implemented)
- Memory sharing between users
