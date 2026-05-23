# Plan 87 — `packages/core` Design Audit Fixes

Branch: `fix/core-design-audit`

## Audit findings

13 design-principle violations identified across five areas. Full audit rationale in conversation history.

## Execution order

Each step must leave `pnpm build && pnpm typecheck` green and all behavioural tests passing before the next step starts. If a change lacks behavioural tests, add them first, confirm green, then make the change.

---

### Group A — Trivials (independent, no cascade)

| # | Item | Files changed | Principle |
|---|------|---------------|-----------|
| 8 | `resolveScope` delegates to `resolveProject` | `scope/resolver.ts` | Hasty Abstractions |
| 9 | `classifyDuplicate` returns `null` not `"none"` | `dedup-policy.ts`, `dedup-policy.test.ts` | POLA |
| 10 | Config catch narrows to `ENOENT` only | `config/loader.ts` | Fail Fast |
| 11 | Rename `computeSourceMemoryHash` → `sourceMemoryHash` | `synthesis/ports.ts`, `sqlite-synthesis-repository.ts`, `engine.ts`, `run-synthesis.ts`, test + mcp stub | Names as Docs |
| 12 | Delete `types.ts`, point barrel at `schemas.ts` | `index.ts` + 10 internal files + delete `types.ts` | Minimize Complexity |

Items 8, 9, 10 have no shared files and can execute in parallel.
Items 11, 12 share `sqlite-synthesis-repository.ts` — must be sequential after 8/9/10.

---

### Group B — Query layer (items 1 + 2 + 7 together)

Single atomic pass over the query context:

1. `query/ports.ts` — `findByEmbedding` accepts `Float32Array`; add `incrementAccessCount` to `QueryAdapter`
2. `query/infrastructure/sqlite-query-adapter.ts` — move `Buffer.from(...)` here; implement `incrementAccessCount`
3. `query/application/query-memories.ts` — remove `queryBlob` conversion; drop `repo` dep; call `adapter.incrementAccessCount`
4. `query/engine.ts` — inject `QueryAdapter` directly; remove `DatabaseManager` and `repo`
5. `query/index.ts` — add `createQueryEngine(db, embedder, activityLogger)` factory
6. `query/engine.test.ts` — remove `repoStub`; verify access count via DB state
7. All callers in `mcp/`, `cli/`, `dashboard/` — swap `new QueryEngine(...)` for `createQueryEngine(...)`

Note: `incrementAccessCount` stays on `MemoryRepository` — `merge-memories.ts` still needs it.

---

### Group C — Memory domain (sequential: 13 → 3 → 4)

**Item 13** — `incrementAccessCountBy(id, delta)` on `MemoryRepository` port + `SqliteMemoryRepository`

**Item 3** — `primaryScopeHash: string` on `Memory` type
- Add field to `MemorySchema` in `schemas.ts`
- Populate in `rowToMemory` as `projects[0]?.scopeHash ?? GLOBAL_SCOPE_HASH`
- Replace all `.projects[0]?.scopeHash` navigation in core + mcp
- Update fake `Memory` literals in tests to include the new field

**Item 4** — `atomicMerge(opts): Memory` on `MemoryRepository`
- Add `AtomicMergeOpts` type and `atomicMerge` to port
- Implement in `SqliteMemoryRepository` as a single `better-sqlite3` transaction: archive → UPDATE content+tags+pinned+access_count+embedding → DELETE drops
- Rewrite `mergeMemories` to call `repo.atomicMerge(...)` once with pre-computed values
- Add stubs to all fake repos in tests

---

### Group D — Synthesis + Session (independent of each other)

**Item 5** — `initializeAndGetDirtyScopes(timeoutMs): DirtyScope[]`
- Add to `SynthesisRepository` port
- Implement in `SqliteSynthesisRepository` as a single `better-sqlite3` transaction
- Replace 3-call sequence in `engine.ts:init()`

**Item 6** — `SessionContext` discriminated union
- Replace flat `SessionContextSchema` with `z.discriminatedUnion("mode", [...])`
- `getSessionContext` returns `{ mode: "synthesis", ... }` or `{ mode: "pinned", ... }`
- Switch `formatContext` in `cli/inject.ts` to `if (ctx.mode === "synthesis")`
- Update mock in `inject.test.ts`
- No changes needed in `mcp/` or `dashboard/`

---

## Changeset

After all items are complete, add a changeset at `.changeset/core-design-audit.md`:

```
---
"@membank/core": patch
---

Refactored core package internals to fix design-principle violations identified in audit: eliminated temporal decomposition in merge and synthesis init, fixed Law of Demeter violations on Memory type, corrected information hiding in the query layer, and removed several shallow/duplicate abstractions.
```
