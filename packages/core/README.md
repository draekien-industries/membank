# @membank/core

Core library for membank — handles storage, embeddings, deduplication, and semantic search.

## Overview

Provides the database layer, embedding inference, and query engine that all other membank packages build on. Uses SQLite with vector search for local, offline-capable memory storage.

## Requirements

- Node.js >=24
- Native modules: `better-sqlite3`, `sqlite-vec` (pre-built binaries, not compiled on install)

## Installation

```bash
npm install @membank/core
```

## Storage

Memories are stored in `~/.membank/memory.db` (SQLite). Embeddings live in a `sqlite-vec` virtual table alongside the main `memories` table.

Default location can be overridden via `DatabaseManager.open(customPath)`.

## Usage

### Initialize

```typescript
import { DatabaseManager, EmbeddingService, MemoryRepository, QueryEngine } from '@membank/core'

const db = DatabaseManager.open()
const embedding = new EmbeddingService()
const repo = new MemoryRepository(db, embedding)
const engine = new QueryEngine(db, embedding, repo)
```

### Save a memory

```typescript
const memory = await repo.save({
  content: 'Always use `--filter` when running pnpm commands in this monorepo',
  type: 'preference',
  tags: ['pnpm', 'monorepo'],
})
```

### Query memories

```typescript
const results = await engine.query({
  query: 'how to run commands in one package',
  limit: 5,
})

for (const { content, score } of results) {
  console.log(score.toFixed(3), content)
}
```

### Session injection

```typescript
import { SessionContextBuilder } from '@membank/core'

const builder = new SessionContextBuilder(db, repo)
const { stats, pinnedGlobal, pinnedProject } = await builder.getSessionContext(projectScope)
```

## Memory types

Types are ranked by priority, which affects query scoring:

| Type | Weight | When to use |
|------|--------|-------------|
| `correction` | 1.0 | A mistake was made and corrected |
| `preference` | 0.8 | Tool, style, or pattern preference |
| `decision` | 0.6 | Architectural or design choice |
| `learning` | 0.4 | Concept understood or insight gained |
| `fact` | 0.2 | Static reference information |

## Deduplication

On every save, the new content is embedded and compared against existing memories of the same type and scope:

- **Similarity >0.92** — auto-overwrites the existing memory (merge semantics)
- **Similarity 0.75–0.92** — flags the existing memory with `needs_review=true` and creates a new entry
- **Similarity <0.75** — creates a new memory with no conflict

## Query scoring

Results are ranked by a weighted combination of signals:

```
score = 0.40 × type_weight
      + 0.30 × access_frequency     # count / (count + 10)
      + 0.20 × recency              # 1 / (1 + days_since_update)
      + 0.10 × is_pinned
```

## Scope

Each memory is tagged with a scope derived from the project's git remote URL (SHA256, first 16 chars). Falls back to a hash of the current working directory if git is unavailable. Global memories use `"global"` as scope.

```typescript
import { resolveScope } from '@membank/core'

const scope = await resolveScope()
```

## Embeddings

Uses `Xenova/bge-small-en-v1.5` (384 dimensions, ~33 MB) via `@huggingface/transformers`. The model is downloaded on first use and cached at `~/.membank/models/`. All inference runs locally on CPU — no network calls after initial download.

## API

### `DatabaseManager`

```typescript
DatabaseManager.open(dbPath?: string): DatabaseManager
DatabaseManager.openInMemory(): DatabaseManager
```

### `EmbeddingService`

```typescript
new EmbeddingService(options?: { progressCallback? })
embed(text: string): Promise<Float32Array>
```

### `MemoryRepository`

```typescript
save(options: SaveOptions): Promise<Memory>
update(id: string, patch: Partial<SaveOptions>): Promise<Memory>
delete(id: string): void
list(opts?: { type?: MemoryType; pinned?: boolean }): Memory[]
stats(): MemoryStats
incrementAccessCount(id: string): void
```

### `QueryEngine`

```typescript
query(options: QueryOptions): Promise<Array<Memory & { score: number }>>
```

### `SessionContextBuilder`

```typescript
getSessionContext(projectScope: string): Promise<SessionContext>
listMemoryTypes(): MemoryType[]
```
