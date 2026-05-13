# @membank/core — Architecture Guide

## Bounded contexts

Every domain area lives under `packages/core/src/<context>/`. Current contexts:

| Context | Path | Responsibility |
|---|---|---|
| Memory | `memory/` | Entities, dedup policy, pin budget, review events |
| Query | `query/` | Semantic search ranking, scoring policy |
| Embedding | `embedding/` | Model load + vector generation (Hugging Face) |
| Persistence | `db/` + `migrations/` | SQLite handle, migration runner, row-type adapters |
| Project | `project/` | Working-directory identity, scope hashing |
| Session | `session/` | Pinned-memory bundle builder for harness session start |
| Synthesis | `synthesis/` | Agent-driven summarization, engine, debounce policy |
| Configuration | `config/` | Runtime config from `~/.membank/config.json` |

## Per-context layered structure

Every context adopts this shape:

```
packages/core/src/<context>/
  domain/                         ← pure, no Node-only imports
    <entity>.ts                   ← types, invariants, value objects
    <policy>.ts                   ← business rules (thresholds, state machines)
    <entity>.test.ts
  application/                    ← orchestration; depends on ports, not adapters
    <use-case>.ts                 ← one file per use-case
    <use-case>.test.ts            ← uses in-memory fake implementations of ports
  infrastructure/                 ← adapters; the only place Node-only deps live
    sqlite-<entity>-repository.ts ← implements port using better-sqlite3
    sqlite-<entity>-repository.test.ts ← integration, real sqlite
  ports.ts                        ← interfaces (MemoryRepository, Embedder, AgentRunner, …)
  index.ts                        ← public re-exports: use-cases + domain types + ports only
```

## Dependency direction (strictly enforced)

```
domain  ←  application  ←  infrastructure
```

- `domain/` files may import from: standard library, other `domain/` files in the same context.
- `domain/` files may NOT import from: `application/`, `infrastructure/`, or Node-only modules.
- `application/` files may import from: `domain/`, `ports.ts`, other contexts' `index.ts`.
- `application/` files may NOT import from: `infrastructure/`.
- `infrastructure/` files may import from anywhere in core.

Presentation packages (`cli`, `mcp`, `dashboard`) may only import from `@membank/core` root or
`@membank/core/<context>` index — never from `@membank/core/.../infrastructure/...`.

These rules are enforced by `scripts/arch-lint.mjs` (run via `pnpm lint`).

## Composition

Wiring concrete adapters into use-cases happens in each context's `index.ts` (or a
`factory.ts` consumed by presentation packages). Use-cases are pure functions over port
interfaces — they have no `better-sqlite3`, `@huggingface/transformers`, or
`@anthropic-ai/claude-agent-sdk` imports.

## Tests

- `domain/*.test.ts` — pure unit tests, no I/O, no DB.
- `application/*.test.ts` — in-memory fake implementations of ports.
- `infrastructure/*.test.ts` — real SQLite, guarded by `MEMBANK_INTEGRATION=true`.
  Follow the pattern in `core/src/db/manager.integration.test.ts`.

## External dependencies

All native and heavyweight deps (`better-sqlite3`, `sqlite-vec`, `@huggingface/transformers`,
`@anthropic-ai/claude-agent-sdk`) are declared external in `tsdown.config.ts` and must never
be imported in `domain/` or `application/` layers.
