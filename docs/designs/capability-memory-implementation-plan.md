# Capability Memory — Implementation Plan

Derived from [`capability-memory.md`](./capability-memory.md), grounded in the current codebase. Executed on branch `feat/tool-skill-memory` in dependency-ordered waves; `pnpm --filter @membank/core build` gates between core waves, full `pnpm build && pnpm typecheck && pnpm lint` gates the end.

## Codebase-grounded decisions (refinements to the spec)

- **Migration**: append tuple `[15, sql]` to `MIGRATIONS` in `core/src/db/manager.ts` (14 is the latest; added `projects.origin`). Two additive `CREATE TABLE`s — no `ALTER` to `memories`/`projects`.
- **`CapabilityKey`**: a frozen value object. `forTool`/`forSkill` build it; `parse(raw)` validates at the boundary and **throws** an actionable error on malformed input (codebase has no `Result` type — Fail Fast is the idiom). `kind`, `name`, `toString()` accessors. Reserved bare words `current|global|all` are rejected by `parse` as capability keys.
- **`MemoryTarget`** (carries resolved payload so git-resolution stays at the boundary, as it is today):
  ```ts
  type MemoryTarget =
    | { tag: "project"; scope: { hash: string; name: string; origin?: string } }
    | { tag: "global" }
    | { tag: "capability"; key: CapabilityKey };
  ```
- **`MemoryQueryScope`**:
  ```ts
  type MemoryQueryScope =
    | { tag: "current"; projectHash: string }   // project ∪ global, hash resolved at boundary
    | { tag: "global" }
    | { tag: "all" }
    | { tag: "capability"; key: CapabilityKey };
  ```
- `saveMemory(opts, deps)`: `opts.projectScope?` → `opts.target: MemoryTarget`. In-core callers updated same wave; presentation callers updated in Wave 3.
- Query adapter `findByEmbedding(emb, {type, projectHash?, includePinned})` gains `capabilityKey?: string`; capability filter joins `memory_capabilities`→`capabilities` on `key = ?` (mutually exclusive with `projectHash`). Application layer maps `MemoryQueryScope` → adapter opts.

## Wave 1 — Core foundation  *(1 agent; gates on `--filter @membank/core build`)*

Files: `core/src/capability/**`, `core/src/db/manager.ts`, `core/src/index.ts` (+ `client.ts` if `CapabilityKey` needed browser-side).

1. **Migration 15** — `capabilities (id PK, kind, key UNIQUE, created_at, updated_at)` + `memory_capabilities (memory_id FK→memories ON DELETE CASCADE, capability_id FK→capabilities ON DELETE CASCADE, PK(memory_id,capability_id))`.
2. **`capability/domain`** — `CapabilityKind` (`as const`), `CapabilityKey` value object, `Capability` entity + Zod `CapabilitySchema`, `CapabilityRow` schema + `rowToCapability` mapper.
3. **`capability/ports.ts`** — `CapabilityRepository`: `upsertByKey`, `findByKey`, `listByKind`, `associate`, `allMemoriesForCapability` (≤25 most-recent, unranked).
4. **`capability/infrastructure`** — `SqliteCapabilityRepository` + `createCapabilityRepository(db)`.
5. **`capability/index.ts`** + re-export from `core/src/index.ts`.

## Wave 2 — Core use-cases  *(1 agent; gates on `--filter @membank/core build`)*

Files: `core/src/memory/application/save-memory.ts`, `core/src/schemas.ts`, `core/src/query/{application,infrastructure,ports}`, `core/src/session/application/get-capability-context.ts` (new), `core/src/session/domain/render-capability-context.ts` (new), `core/src/session/index.ts`, `core/src/index.ts`.

1. Define `MemoryTarget` / `MemoryQueryScope` (capability domain or a shared scope module) + exports.
2. Refactor `saveMemory`: `projectScope?` → `target`; `capability` variant upserts capability + associates via `CapabilityRepository`. Update in-core callers.
3. Query: adapter `capabilityKey?` join filter; `queryMemories` accepts `MemoryQueryScope` and maps to adapter opts.
4. `getCapabilityContext(key, deps)` UseCase — `allMemoriesForCapability` → `renderCapabilityContext`; returns `null`/empty when no memories.
5. `renderCapabilityContext(memories)` — XML-ish block (mirror `render-session-context.ts`) + capture nudge.

## Wave 3 — Presentation  *(3 agents in parallel — disjoint packages)*

- **MCP** (`packages/mcp`): extend `SaveScopeSchema`/`QueryScopeSchema` to also accept `tool:<name>`/`skill:<name>` (union of enum + pattern); parse scope string → `MemoryTarget`/`MemoryQueryScope` at the boundary (invalid → fail fast). Update `save_memory`/`query_memory` handlers to the new core signatures.
- **CLI** (`packages/cli`): `inject --event PreToolUse` — read hook JSON from **stdin**, derive `CapabilityKey` (`tool_name === "Skill"` → `skill:${tool_input.skill}`, else `tool:${tool_name}`), call `getCapabilityContext`, emit `additionalContext` JSON or nothing. `injection-hook-writer.ts`: register claude-code `PreToolUse` `{matcher:"Skill|mcp__.*", command:"npx -y @membank/cli inject --harness claude-code --event PreToolUse"}` idempotently. Fix the `add` command's `saveMemory` call.
- **Dashboard** (`packages/dashboard`): `GET /api/capabilities` (+ `:key` detail/memories), client collection + a "Tool & Skill Memories" view reusing `MemoryRow`/detail/pin/delete. Projects list already excludes capabilities (separate table) — no filtering needed.

## Wave 4 — Verify + changeset

- `pnpm build && pnpm typecheck && pnpm lint` clean.
- Add tests mirroring existing suites (capability repo, save/query targeting, getCapabilityContext, MCP scope parse, CLI PreToolUse derivation).
- `.changeset/<slug>.md` — `minor` for `@membank/core`, `@membank/mcp`, `@membank/cli`, `@membank/dashboard`.
- Note: existing installs must re-run `membank setup` to register the PreToolUse hook.
