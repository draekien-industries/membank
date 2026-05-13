# Plan 36 — Core Business Logic Restructure

Restructure the monorepo so that **`@membank/core` owns all business logic and external integrations**, and `@membank/cli`, `@membank/mcp`, and `@membank/dashboard` become **thin presentation adapters**. Apply uniform domain/application/infrastructure layering inside every bounded context in core. **Zero behavioural changes** at the CLI / MCP / dashboard / DB surfaces.

> This plan supersedes the open-issues plans archived at [archive/open-issues-27-35/](archive/open-issues-27-35/). All issues 27–35 have shipped; this is the next architectural initiative.

---

## 1. Goals

1. Core owns all domain rules, persistence, and external integrations (SQLite, sqlite-vec, Hugging Face embedder, Claude Agent SDK).
2. Presentation packages contain only adapter code: argv parsing, MCP tool registration, HTTP routing, formatting, exit codes.
3. Inside core, every bounded context follows the same shape: `domain/` (pure), `application/` (use-cases), `infrastructure/` (adapters). Tests sit beside the code they exercise.
4. The architectural drift that produced `packages/mcp/src/synthesis/engine.ts` becomes mechanically detectable in code review — presentation packages never import from core's `infrastructure/`.

## 2. Constraints (locked surfaces)

The following surfaces **must remain byte-identical** before and after this work:

- **CLI**: every subcommand name, flag, argument order, stdout format, exit code. `pnpm --filter @membank/cli test` must pass unchanged. Snapshot tests stay green.
- **MCP**: every tool name, input schema, output schema. The stdio protocol shape is frozen.
- **DB**: the SQLite schema, migration sequence, file paths (`~/.membank/memory.db`, `~/.membank/models/`, `~/.membank/config.json`).
- **HTTP API** (dashboard `/api/*`): every route, method, request body shape, response body shape. The React client must run unmodified against the new server.

Surfaces that **may change** (clean break, no shims):

- Public exports of any `@membank/*` package. Internal consumers update atomically with the move. No `@deprecated` re-exports.

## 3. Target architecture

### 3.1 Bounded contexts (all live under `packages/core/src/`)

| Context | Today | Notes |
|---|---|---|
| **Memory** | `memory/` | Holds entities, dedup policy (cosine 0.92 / 0.75 thresholds), pin budget. Repository currently mixes SQL with policy. |
| **Query** | `query/` | Semantic search ranking. Cosine + recency + access-count scoring. |
| **Embedding** | `embedding/` | Hugging Face model load + vector generation. Single integration. |
| **Persistence** | `db/` + `migrations/` | SQLite handle, migrations runner, row-type adapters. |
| **Project** | `project/` | Working-directory identity, associations. Scope hashing. |
| **SessionInjection** | `session/` | Builds the stats + pinned-memory bundle for harness session start. |
| **Synthesis** | `synthesis/` (+ moved-in `mcp/synthesis/`) | Agent-driven memory summarization. Engine, agent loop, debounce policy, in-flight tracking. |
| **Configuration** | `config/` | Runtime config resolution from `~/.membank/config.json`. |

Presentation packages (no domain of their own):

- **CLI** — `packages/cli` — argv → use-case → stdout/exit.
- **MCPServer** — `packages/mcp` — tool registration → use-case → MCP response.
- **Dashboard** — `packages/dashboard` — Hono routes → use-case → JSON. React client untouched.

### 3.2 Per-context layered structure

Every domain context — even small ones — adopts this shape:

```
packages/core/src/<context>/
  domain/                          ← pure, no Node-only imports
    <entity>.ts                    ← types, invariants, value objects
    <policy>.ts                    ← business rules (e.g. dedup thresholds)
    <entity>.test.ts
  application/                     ← orchestration; depends on ports
    <use-case>.ts                  ← one file per use-case
    <use-case>.test.ts
  infrastructure/                  ← adapters; the only place Node-only deps live
    sqlite-<entity>-repository.ts  ← implements the port using better-sqlite3
    sqlite-<entity>-repository.test.ts
  ports.ts                         ← interfaces (MemoryRepository, Embedder, AgentRunner, …)
  index.ts                         ← public re-exports: use-cases + domain types + ports only
```

**Dependency direction is strict**: `domain` ← `application` ← `infrastructure`. `domain/` files may not import from `application/` or `infrastructure/`. `application/` files may not import from `infrastructure/`. Composition (wiring concrete adapters into use-cases) happens in `index.ts` per context, or in a per-context `factory.ts` consumed by presentation packages.

### 3.3 Worked example: Memory context

Today (collapsed):
```
core/src/memory/
  index.ts
  repository.ts          ← SaveOptions parsing, embedding call, cosine SQL, dedup policy, persistence, review event creation — all in one class
  repository.test.ts
```

After:
```
core/src/memory/
  domain/
    memory.ts            ← Memory, MemoryType, MemoryPatch types
    dedup-policy.ts      ← classifyDuplicate(similarity, type) → "overwrite" | "flag" | "none"; constants AUTO_OVERWRITE_THRESHOLD = 0.92, FLAG_THRESHOLD = 0.75
    pin-budget.ts        ← PIN_BUDGET_THRESHOLD, budget checks
    review-event.ts      ← ReviewEvent type
    memory.test.ts
    dedup-policy.test.ts ← pure unit tests, no DB
  application/
    save-memory.ts       ← orchestrates: validate → embed → query similar → apply dedup-policy → persist
    update-memory.ts
    delete-memory.ts
    resolve-review.ts
    save-memory.test.ts  ← uses in-memory fake repo + fake embedder
  infrastructure/
    sqlite-memory-repository.ts   ← all SQL queries, row mapping
    sqlite-memory-repository.test.ts ← integration, real sqlite
  ports.ts               ← MemoryRepository, Embedder (re-exported from embedding context)
  index.ts               ← exports use-cases + Memory types + ports
```

`save-memory.ts` becomes a pure function over ports — no `better-sqlite3` imports, fully unit-testable.

### 3.4 Synthesis context (special — agent SDK consolidation)

All of `packages/mcp/src/synthesis/` moves into `packages/core/src/synthesis/`. `@membank/core` takes a direct dependency on `@anthropic-ai/claude-agent-sdk`. The MCP package no longer touches synthesis logic; it only triggers `runSynthesis()` from core in response to MCP lifecycle events.

```
core/src/synthesis/
  domain/
    synthesis-job.ts       ← job state machine, dirty-scope tracking
    debounce-policy.ts     ← DEFAULT_DEBOUNCE_MS, MAX_BACKOFF_MULTIPLIER, IN_FLIGHT_TIMEOUT_MS
  application/
    run-synthesis.ts       ← orchestrates one synthesis pass for a scope
    engine.ts              ← long-running debounce loop, in-flight tracking, failure backoff
  infrastructure/
    sqlite-synthesis-repository.ts
    claude-agent-runner.ts ← Claude Agent SDK adapter implementing AgentRunner port
  ports.ts                 ← AgentRunner interface
  index.ts
```

## 4. Migration strategy — phased per context

One PR per phase. Each phase is self-contained: moves code, updates internal consumers, ships a changeset, passes existing tests unchanged. **No phase touches public DB / CLI / MCP / HTTP surfaces.**

### Phase 0 — scaffolding & guardrails (1 PR, S)

- Add an architecture lint rule (Biome `noRestrictedImports` or a simple custom script) enforcing the dependency direction inside core: `domain/` cannot import from `application/` or `infrastructure/`; `application/` cannot import from `infrastructure/`.
- Add a second guard: presentation packages (`cli`, `mcp`, `dashboard`) may only import from `@membank/core` root or `@membank/core/<context>` — never from `@membank/core/.../infrastructure/...`.
- Document the per-context shape in `packages/core/CLAUDE.md` (new file or appended).
- No code moves yet.

**Changeset**: `@membank/core` patch — "Added architectural guard rails for the upcoming core-restructure work."

### Phase 1 — Memory + Persistence (1 PR, M)

Split `memory/repository.ts` into the layered shape described in §3.3. Move `db/` row-type helpers to `persistence/infrastructure/`. Memory context's `infrastructure/` depends on Persistence's exported handle.

Order inside the PR:
1. Create new files; copy logic in stages, leaving old `repository.ts` exporting the same class names.
2. Switch `index.ts` re-exports to point at new files.
3. Delete old files.
4. Update `cli`, `mcp`, `dashboard` imports if any landed on internal paths (most use the root `@membank/core` export — no changes needed).

**Tests**: existing `memory/repository.test.ts` splits into pure unit tests (dedup-policy) and integration tests (sqlite-memory-repository.test.ts). All tests stay green.

**Changeset**: `@membank/core` minor — "Reorganized Memory and Persistence into domain/application/infrastructure layers; no behavioural change."

### Phase 2 — Query + Embedding (1 PR, S)

Apply the same shape to `query/` and `embedding/`. Query context defines a `MemoryRepository` port (or re-uses Memory's) and an `Embedder` port. Cosine-scoring policy moves to `query/domain/scoring.ts`.

**Changeset**: `@membank/core` minor — "Reorganized Query and Embedding contexts; cosine scoring policy isolated to pure domain module."

### Phase 3 — Project + SessionInjection + Configuration (1 PR, S)

Same treatment for the smaller contexts. SessionInjection's pinned-memory-bundle builder becomes a pure application use-case over Memory + Project repositories.

**Changeset**: `@membank/core` patch — "Reorganized Project, SessionInjection and Configuration contexts."

### Phase 4 — Synthesis consolidation (1 PR, L)

The big one. Move `packages/mcp/src/synthesis/` into `packages/core/src/synthesis/`:

1. Add `@anthropic-ai/claude-agent-sdk` to `@membank/core` dependencies (use `pnpm add`, do not hand-edit `package.json`).
2. Move `agent-loop.ts` → `core/src/synthesis/infrastructure/claude-agent-runner.ts`, refactored behind an `AgentRunner` port.
3. Move `engine.ts` → `core/src/synthesis/application/engine.ts`.
4. Update `packages/mcp/src/index.ts` and `packages/mcp/src/server.ts` to import the synthesis entrypoint from `@membank/core` and call it. Remove `packages/mcp/src/synthesis/`.
5. Update `tsdown.config.ts` in core to keep `@anthropic-ai/claude-agent-sdk` external (do not bundle).
6. Move `packages/mcp/src/synthesis/*.test.ts` to `packages/core/src/synthesis/`, adapting imports.

**Locked surface check**: the MCP server still triggers synthesis on the same events with the same debounce. Add an end-to-end test asserting that an MCP `save_memory` call still marks the scope dirty for synthesis.

**Changeset**:
- `@membank/core` minor — "Consolidated synthesis engine and Claude Agent SDK integration into core."
- `@membank/mcp` patch — "Synthesis logic moved into @membank/core; MCP server now delegates."

### Phase 5 — Dashboard server as thin adapter (1 PR, M)

Today's `packages/dashboard/src/server/index.ts` contains:
- Raw SQL queries (`SELECT m.* FROM memories m WHERE …`).
- Custom row parsing (`parseRow`, `parseReviewEvent`).
- Stats aggregation logic.
- Review-event joining.

All of this duplicates or extends what already exists in core repositories. Migration:

1. Extract every per-route SQL into a core use-case (most already exist: `listMemories`, `getMemory`, `updateMemory`, `deleteMemory`, `listProjects`, `renameProject`, `getStats`). Where a use-case is missing, add it to the appropriate context's `application/` folder.
2. Rewrite each Hono handler as 3–5 lines: parse query/body → call use-case → return JSON. Custom row parsers in the server are deleted.
3. Static-file serving and port discovery stay in dashboard (those are genuinely presentation).
4. Add a test pinning the JSON response shape per route — guarantees the React client keeps working.

**Locked surface check**: snapshot each `/api/*` response shape before and after; diff must be empty.

**Changeset**:
- `@membank/dashboard` patch — "Dashboard server reduced to thin HTTP adapter; all data operations delegated to @membank/core use-cases."
- `@membank/core` patch — "Added use-cases backing the dashboard HTTP API."

### Phase 6 — CLI command audit (1 PR, S)

Walk `packages/cli/src/commands/*.ts`. Each command should be:
```ts
export async function runFooCommand(args: FooArgs, deps: Deps): Promise<void> {
  const result = await deps.fooUseCase(args.toFooInput());
  process.stdout.write(formatFoo(result));
}
```

Move any inline business logic (e.g. anything in `inject.ts`, `import.ts`, `export.ts` that isn't pure formatting/IO) into core use-cases. Most commands are already thin — this phase is largely an audit.

**Changeset**: `@membank/cli` patch — "CLI commands audited; remaining business logic moved into @membank/core."

### Phase 7 — Cleanup & guard rail enforcement (1 PR, XS)

- Tighten the architectural lint rule from Phase 0 (it may have started as warnings; flip to errors).
- Delete the deprecated `scope/` folder (already marked deprecated in `core/UBIQUITOUS_LANGUAGE.md`) if no consumers remain.
- Verify all `@membank/core` exports flow through `packages/core/src/index.ts` and that nothing reaches into `infrastructure/` from outside.

**Changeset**: `@membank/core` patch — "Removed deprecated Scope module and enforced architectural boundaries via lint."

---

## 5. Per-phase execution rules

Every phase PR must:

1. Pass `pnpm typecheck`, `pnpm lint`, `pnpm test` on every package — not just the touched one.
2. Run the dashboard end-to-end against the new server build to confirm the React client still works (Phase 5 specifically).
3. For Phase 4, run the MCP server against Claude Code and confirm `save_memory` → synthesis trigger still fires.
4. Ship a changeset describing user-visible impact (which is "none, internal restructure"). Use past tense.
5. Conventional commit on the merge: `refactor(core): <phase summary>`.
6. Run `/simplify` per the CLAUDE.md implementation checklist.

## 6. Risks & mitigations

- **Circular imports** between contexts (e.g. Memory needs Project, SessionInjection needs both). Mitigation: ports are defined where they're *consumed*, adapters are *injected*. Composition lives in `index.ts` per context.
- **`@anthropic-ai/claude-agent-sdk` in core** could complicate browser/edge use of core in the future. Mitigation: keep it as an `optionalDependencies` candidate if synthesis becomes opt-in; today it's required, so a regular dep is correct.
- **Hidden CLI / MCP behavioural changes** during dashboard server rewrite. Mitigation: snapshot tests on `/api/*` response bodies before Phase 5 starts.
- **Phase 4 conflict with in-flight synthesis work.** Mitigation: Phase 4 must merge from a quiescent main; coordinate with any feature branch touching `packages/mcp/src/synthesis/`.
- **Architecture-lint false positives** for legitimate cross-layer imports (e.g. an application file importing a domain type by value). Mitigation: rule allows imports of types/values from `domain/` into `application/` and `infrastructure/`. Only blocks the reverse direction.

## 7. Out of scope

- Renaming any database table or column.
- Changing any CLI flag, MCP tool, or HTTP route.
- Adding new features. This is restructure-only.
- Replacing better-sqlite3, sqlite-vec, Hugging Face transformers, or Claude Agent SDK. Adapters wrap them; we don't swap them.
- Browser/edge runtime support for core. The structure makes it *possible* later; this plan doesn't deliver it.

## 8. Definition of done

- All seven phases merged.
- `pnpm test` green across all packages.
- Architectural lint enforced as error.
- `packages/cli/`, `packages/mcp/`, `packages/dashboard/` contain no SQL strings, no `better-sqlite3` imports, no `@anthropic-ai/claude-agent-sdk` imports, no `@huggingface/transformers` imports.
- A reviewer reading any `application/<use-case>.ts` can understand the business rule without opening `infrastructure/`.
