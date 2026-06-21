# Capability Memory

## Name and Purpose

A memory-grouping mechanism that attaches transferable memories to a **Capability** (a tool or skill) independent of any **Project**, surfacing them by explicit query and by automatic injection before that capability is used.

## Bounded Context *(DDD)*

- **Core** — defines `Capability`, `CapabilityAssociation` (new this session). References `Project`, `Association`, `GlobalMemory`, `MemoryType`.
- **Session** — defines `CapabilityContext` (new this session). References `SessionContext`, `PinnedMemory`.
- **Architecture** — constrained by `LockedSurface` (DB schema, MCP tools, CLI commands, dashboard `/api/*`), `UseCase`, `Port`, `PresentationPackage`, and the three layers (`DomainLayer`/`ApplicationLayer`/`InfrastructureLayer`).

## Key Data Structures

```
CapabilityKind = "tool" | "skill"

// Value object — the ONLY way to construct a key. Makes invalid keys unrepresentable.
CapabilityKey {
  forTool(toolName: NonEmptyString): CapabilityKey          // -> "tool:<name>"
  forSkill(skillName: NonEmptyString): CapabilityKey         // -> "skill:<name>"
  parse(raw: string): Result<CapabilityKey, InvalidKey>      // boundary use only
  kind: CapabilityKind
  name: string
  toString(): string                                         // "tool:Bash"
}

Capability { id, kind: CapabilityKind, key: string, createdAt, updatedAt }
// invariant: key === `${kind}:${name}`, name non-empty — enforced by CapabilityKey

// New tables (ADDITIVE — no ALTER to memories/projects):
capabilities         (id PK, kind, key UNIQUE, created_at, updated_at)
memory_capabilities  (memory_id FK->memories, capability_id FK->capabilities, PK(both), cascade)

// Where a memory attaches — concept-shaped discriminated union, not a stringly param:
MemoryTarget      = {tag:"project"} | {tag:"global"} | {tag:"capability", key: CapabilityKey}
MemoryQueryScope  = {tag:"current"} | {tag:"global"} | {tag:"all"} | {tag:"capability", key: CapabilityKey}
```

## Interface

```
// core — capability context (Port)
CapabilityRepository (Port):
  upsertByKey(key: CapabilityKey): Capability
  findByKey(key: CapabilityKey): Capability | null
  listByKind(kind: CapabilityKind): Array<Capability & {memoryCount}>    // dashboard
  associate(memoryId, capabilityId): void
  allMemoriesForCapability(key: CapabilityKey): Memory[]                 // up to 25 most-recent, unranked

// core — UseCases
saveMemory(content, type, tags, target: MemoryTarget): Memory           // target replaces projectScope?
queryMemories(query, type?, scope: MemoryQueryScope, limit?, includePinned?): Result[]
getCapabilityContext(key: CapabilityKey): CapabilityContext | null      // session/application; query, no mutation

// session/domain
renderCapabilityContext(memories): string                              // memories + capture nudge

// cli (PresentationPackage — adapts harness payload, no business logic)
inject --event PreToolUse:  stdin JSON -> CapabilityKey -> getCapabilityContext -> additionalContext | (nothing)
injection-hook-writer:      register claude-code PreToolUse
                            {matcher:"Skill|mcp__.*", cmd:"npx -y @membank/cli inject --harness claude-code --event PreToolUse"}
                            idempotently

// mcp (PresentationPackage — parses scope string at boundary)
save_memory.scope / query_memory.scope: "current" | "global" | "all" | "tool:<name>" | "skill:<name>"
  -> parsed to MemoryTarget / MemoryQueryScope; invalid -> fail fast with actionable error
```

## Design Rationale

**Separate `Capability` entity + own junction, not a `kind` column on `projects`** — `Project` is defined as *a working directory*; a tool/skill is not. Overloading the table would redefine a first-class entity (ubiquitous-language conflict), revive the deprecated `Scope`, and mutate a high-traffic `LockedSurface`. A sibling entity keeps `Project` uncoupled (Information Hiding) and is the right seam per AHA — the shared trait (memory↔grouping link) is real, but the grouping *axis* differs, so a parallel junction is correct duplication, not a missed abstraction.

**`CapabilityKey` value object** — the stringly-typed `union(enum, /^(tool|skill):.+/)` admitted invalid states (`"tool:"`, `"global:x"`). Constructing keys only via `forTool`/`forSkill`, with `parse` used only at the boundary, makes invalid keys unrepresentable internally (Define Errors Out of Existence) and forces validation at the MCP/CLI edge (Fail Fast). Reserved words `current|global|all` are bare; capability keys are always prefixed, so the wire grammar is unambiguous.

**`MemoryTarget` / `MemoryQueryScope` discriminated unions** — shape the core API around the concept "where does this memory attach / where do I search," not around one caller's string (Strategic Programming). `saveMemory`'s prior `projectScope?` parameter becomes `target: MemoryTarget` — a core-internal `ApplicationLayer` refactor (not a `LockedSurface`), chosen over a parallel capability-save path so there is one coherent "where does this memory go" concept rather than two divergent code paths.

**`getCapabilityContext` is a core UseCase; CLI stays thin** — key-derivation-from-harness-payload (the `tool_name === "Skill"` special case that reads `tool_input.skill`) is boundary adaptation that lives in the CLI harness adapter, but the *retrieval + render* is business logic and belongs in core (PresentationPackage owns no business logic; Single Abstraction Level).

**Keyed injection, no embeddings** — `CapabilityContext` is defined as a keyed lookup returning up to the 25 most-recent of a capability's (self-curated, therefore few) memories, unranked, keeping the per-tool-call hot path free of model loads (POLA, performance). The cap is a safety valve, not a relevance filter — the retrieval method `allMemoriesForCapability` is named so its "returns the set, no ranking" behaviour is legible without a comment. Distinct from explicit `query_memory(scope:"tool:Bash", query:"…")`, which *is* a semantic search restricted to that capability via a join filter in the query adapter.

**Additive schema** — new tables only; `memories`/`projects` untouched. Lowest-risk `LockedSurface` change, and as a free consequence the dashboard's projects list **cannot** show capabilities (different table) — the "don't pollute the project list" problem disappears by construction; dashboard work is purely additive views/endpoints.

## Internal Decomposition

- **`core/src/capability/domain`** — `Capability` entity, `CapabilityKey` value object, `CapabilityKind`.
- **`core/src/capability/application`** — `CapabilityRepository` port.
- **`core/src/capability/infrastructure`** — `SqliteCapabilityRepository`.
- **`core/src/session/application/get-capability-context.ts`** — keyed retrieval UseCase (mirrors `get-session-context.ts`).
- **`core/src/session/domain/render-capability-context.ts`** — renders memories + capture nudge.
- **`core/src/memory/application` + `core/src/query/...`** — `saveMemory`/`queryMemories` accept the new `MemoryTarget`/`MemoryQueryScope`; query adapter gains a capability-join filter.
- **`cli`** — `inject` PreToolUse harness adapter; `injection-hook-writer` registration.
- **`mcp`** — boundary parse of the scope string into typed targets.
- **`dashboard`** — capability list/detail views + `/api` endpoints.

## Rejected Alternatives

- **`kind` column on `projects`** (original aligned plan) — redefines `Project`, revives deprecated `Scope`, mutates a hot `LockedSurface`.
- **Revive a `Scope`/`MemoryGroup` supertype** — reverses a deliberate deprecation; largest blast radius (schema + resolver + every scope param).
- **Tool/skill as a memory column/tag** — breaks the established memory↔grouping *association* model and `GlobalMemory = "no associations"`; can't reuse pinning/query-join machinery.
- **Pass the raw scope string into core** — admits invalid states; parse to `CapabilityKey` at the boundary instead.
- **Key-derivation + lookup in the CLI command** — places business logic in a `PresentationPackage`.

## Out of Scope (this round)

- Codex (`PreToolUse`) and opencode (`tool.execute.before`) injection wiring — the Core/MCP capability model is harness-agnostic; only the claude-code injection hook is wired now.
- `Synthesis` over capability memories — capabilities are excluded from synthesis initially.

## Assumptions to Verify at Implementation

- PreToolUse `additionalContext` injection works on Claude Code `2.1.183` (documented; confirm empirically when the hook is built).
- Per-tool-call synchronous hook cost (Node/npx cold start) is acceptable; the `Skill|mcp__.*` matcher keeps it off the hot path. To be measured.
- Existing installs must re-run `membank setup` to register the new hook.
