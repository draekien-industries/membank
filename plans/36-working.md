# Plan 36 — Working Checklist

Branch: `refactor/codebase-restructure`

## Phase 0 — Scaffolding & Guardrails

- [x] Architecture lint rule added: `domain/` cannot import from `application/` or `infrastructure/`; `application/` cannot import from `infrastructure/`
- [x] Presentation package guard added: `cli`, `mcp`, `dashboard` may not import from `@membank/core/.../infrastructure/...`
- [x] Per-context layered shape documented in `packages/core/CLAUDE.md`

## Phase 1 — Memory + Persistence

- [ ] `core/src/memory/domain/memory.ts` — `Memory`, `MemoryType`, `MemoryPatch` types
- [ ] `core/src/memory/domain/dedup-policy.ts` — `classifyDuplicate()`, `AUTO_OVERWRITE_THRESHOLD = 0.92`, `FLAG_THRESHOLD = 0.75`
- [ ] `core/src/memory/domain/pin-budget.ts` — `PIN_BUDGET_THRESHOLD`, budget checks
- [ ] `core/src/memory/domain/review-event.ts` — `ReviewEvent` type
- [ ] `core/src/memory/domain/*.test.ts` — pure unit tests (no DB)
- [ ] `core/src/memory/application/save-memory.ts` — validate → embed → query similar → dedup-policy → persist
- [ ] `core/src/memory/application/update-memory.ts`
- [ ] `core/src/memory/application/delete-memory.ts`
- [ ] `core/src/memory/application/resolve-review.ts`
- [ ] `core/src/memory/application/*.test.ts` — use in-memory fake repo + fake embedder
- [ ] `core/src/memory/infrastructure/sqlite-memory-repository.ts` — all SQL queries, row mapping
- [ ] `core/src/memory/infrastructure/sqlite-memory-repository.test.ts` — integration, real sqlite (use `MEMBANK_INTEGRATION=true` guard + file-based path, following pattern in `core/src/db/manager.integration.test.ts`)
- [ ] `core/src/memory/ports.ts` — `MemoryRepository`, `Embedder` interfaces
- [ ] `core/src/memory/index.ts` — exports use-cases + Memory types + ports only
- [ ] Old `memory/repository.ts` deleted
- [ ] DB row-type helpers moved to `persistence/infrastructure/`

## Phase 2 — Query + Embedding

- [ ] `core/src/query/domain/scoring.ts` — cosine + recency + access-count scoring policy
- [ ] `core/src/query/application/` — query use-cases
- [ ] `core/src/query/infrastructure/` — SQLite query adapters
- [ ] `core/src/query/ports.ts` — `MemoryRepository`, `Embedder` ports (or re-uses Memory's)
- [ ] `core/src/query/index.ts`
- [ ] `core/src/embedding/domain/`, `application/`, `infrastructure/` — layered shape
- [ ] `core/src/embedding/ports.ts`
- [ ] `core/src/embedding/index.ts`

## Phase 3 — Project + SessionInjection + Configuration

> Already done (no checklist items): `ProjectRepository.upsertByHash()` validates 16-char hex (14efb94). Migration v5 (scope_hash CHECK constraint + corrupt-hash rescue) is in `db/manager.ts`. Phase 3 only applies layering.

- [ ] `core/src/project/` — domain/application/infrastructure layered shape
- [ ] `core/src/session/` — pinned-memory-bundle builder as pure application use-case over Memory + Project repositories
- [ ] `core/src/config/` — runtime config resolution layered shape

## Phase 4 — Synthesis Consolidation

> Partial state: `core/src/synthesis/repository.ts` already exists (flat). `mcp/src/synthesis/{agent-loop.ts,engine.ts}` still need to move to core.

- [ ] `@anthropic-ai/claude-agent-sdk` added to `@membank/core` deps via `pnpm add`
- [ ] `core/src/synthesis/domain/synthesis-job.ts` — job state machine, dirty-scope tracking
- [ ] `core/src/synthesis/domain/debounce-policy.ts` — `DEFAULT_DEBOUNCE_MS`, `MAX_BACKOFF_MULTIPLIER`, `IN_FLIGHT_TIMEOUT_MS`
- [ ] `core/src/synthesis/application/run-synthesis.ts`
- [ ] `core/src/synthesis/application/engine.ts` — move from `mcp/src/synthesis/engine.ts`; debounce loop, in-flight tracking, failure backoff
- [ ] `core/src/synthesis/infrastructure/sqlite-synthesis-repository.ts` — rename from existing `core/src/synthesis/repository.ts`
- [ ] `core/src/synthesis/infrastructure/claude-agent-runner.ts` — move from `mcp/src/synthesis/agent-loop.ts`; refactored behind `AgentRunner` port
- [ ] `core/src/synthesis/ports.ts` — `AgentRunner` interface
- [ ] `core/src/synthesis/index.ts`
- [ ] `packages/mcp/src/index.ts` + `server.ts` updated to import synthesis from `@membank/core`
- [ ] `packages/mcp/src/synthesis/` directory deleted
- [ ] `@anthropic-ai/claude-agent-sdk` kept external in `core/tsdown.config.ts`
- [ ] Synthesis tests moved to `core/src/synthesis/` with updated imports
- [ ] E2E test: MCP `save_memory` call still marks scope dirty for synthesis

## Phase 5 — Dashboard Server as Thin Adapter

- [ ] API response shapes snapshotted before changes (baseline for diff)
- [ ] Every per-route SQL in `dashboard/src/server/index.ts` extracted into core use-cases
- [ ] Missing use-cases added to appropriate `core/src/<context>/application/` folders
- [ ] Each Hono handler rewritten to: parse → call use-case → return JSON (3–5 lines)
- [ ] Custom `parseRow` / `parseReviewEvent` parsers in dashboard server deleted
- [ ] Snapshot diff of `/api/*` response shapes is empty
- [ ] Dashboard React client verified working against new server build

## Phase 6 — CLI Command Audit

- [ ] Every `packages/cli/src/commands/*.ts` is pure formatting/IO (no inline business logic)
- [ ] Any business logic from `inject.ts`, `import.ts`, `export.ts` moved to core use-cases

## Phase 7 — Cleanup & Guard Rail Enforcement

- [ ] Architecture lint rules flipped from warnings to errors
- [ ] Deprecated `scope/` folder deleted (if no consumers remain)
- [ ] All `@membank/core` exports verified to flow through `packages/core/src/index.ts`
- [ ] No path from outside core reaches into any `infrastructure/` sub-folder

## Definition of Done

- [ ] All seven phases committed on `refactor/codebase-restructure`
- [ ] `pnpm test` green across all packages
- [ ] Architectural lint enforced as error
- [ ] `packages/cli/` contains no SQL strings, no `better-sqlite3` imports, no `@anthropic-ai/claude-agent-sdk` imports, no `@huggingface/transformers` imports
- [ ] `packages/mcp/` contains no SQL strings, no `better-sqlite3` imports, no `@anthropic-ai/claude-agent-sdk` imports, no `@huggingface/transformers` imports
- [ ] `packages/dashboard/` contains no SQL strings, no `better-sqlite3` imports, no `@anthropic-ai/claude-agent-sdk` imports, no `@huggingface/transformers` imports
- [ ] A reviewer can understand any `application/<use-case>.ts` without opening `infrastructure/`
- [ ] Single changeset created covering all affected packages
