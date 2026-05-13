# Plan: #35 — Background memory synthesis engine

## Issue Summary

Implement a background synthesis engine that consolidates raw memories into curated context summaries via Claude Haiku + `@anthropic-ai/agent-sdk`. This feature replaces verbatim `<pinned-memories>` injection with synthesized context at session start.

**Core behaviors**:
- Session start triggers bootstrap synthesis for both global and per-project scopes
- Syntheses are computed in background with adaptive 45s debounce
- Raw memory changes flag syntheses for refresh (dirty tracking via SHA-256 hash)
- Syntheses replace verbatim pinned injection (except when absent or in-flight)
- Pinning semantics change: pinned = fidelity signal in synthesis prompt, not "always inject verbatim"
- Per-scope in-flight guard prevents concurrent synthesis runs
- 30-day staleness TTL on syntheses; older ones are re-synthesized
- Opt-in via setup prompt or `membank config set synthesis.enabled true`
- Separate global + per-project syntheses in new `syntheses` table

## Verification

### Current SessionContextBuilder location and pinned injection flow
- **Location**: `packages/core/src/session/builder.ts:15-59`
- **Current behavior** (lines 22–40):
  - Queries pinned global memories (not in memory_projects table)
  - Queries pinned project-scoped memories (joined on memory_projects + projects)
  - Returns { stats, pinnedGlobal, pinnedProject } as SessionContext type
- **Injection point**: `packages/cli/src/commands/inject.ts:66-76` calls getSessionContext() then formats via formatContext() (line 17)
- **Output format**: XML blocks <memory-stats>, <pinned-memories>, <memory-guidance> injected into harness session context

### Config infrastructure status
- **Location**: `packages/cli/src/setup/harness-config-writer.ts` — manages harness MCP configs
- **~/.membank/config.json**: Does NOT exist yet. This issue introduces membank's own config system
- **Current config pattern**: Harness configs only; membank has no user-facing config yet
- **Needed**: New config file at ~/.membank/config.json with schema { synthesis: { enabled: boolean, ... } }

### Database migrations and schema
- **Location**: `packages/core/src/db/manager.ts:12-92`
- **Current migration system**: Version-based, stored in meta table (schema_version key)
- **Pattern**: MIGRATIONS array at lines 12–92, each [version, sql] tuple
- **Schema**: Uses raw SQL (not Drizzle) — better-sqlite3 + sqlite-vec
- **Current tables**: memories, embeddings (vec0), projects, memory_projects, memory_review_events, meta
- **Migration 3** (lines 72–90): Added review_events table, dropped needs_review column
- **Next migration version**: 4 (will add syntheses table)

### Repository layer pattern
- **Location**: `packages/core/src/memory/repository.ts:29-364`
- **Pattern**: Dependency injection, prepared statements with type generics
- **Methods**: save(), update(), delete(), list(), listFlagged(), stats(), setPin(), etc.
- **Error handling**: Throws Error on not found; uses MemoryRowSchema for validation
- **SynthesisRepository will mirror this pattern**

### @anthropic-ai/claude-agent-sdk dependency status
- **Package name**: `@anthropic-ai/claude-agent-sdk` (TypeScript Agent SDK — NOT `@anthropic-ai/agent-sdk`, that name is incorrect)
- **Current**: NOT in any package.json
- **Install**: `pnpm add @anthropic-ai/claude-agent-sdk --filter @membank/mcp` (let pnpm resolve latest, do not hand-pin)
- **ESM requirement**: SDK requires ES modules — confirmed `@membank/mcp` already has `"type": "module"` in package.json
- **Environment**: Issue body specifies `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` (Claude Max, no API key). The SDK's default auth is `ANTHROPIC_API_KEY`; verify at implementation time that the SDK honors the OAuth token env var (or document the fallback to API key if the SDK doesn't support it natively, e.g. by passing a custom auth header).
- **Runtime context**: Runs in MCP server process (long-lived) — needs signal handling
- **Reference**: Official docs at https://docs.claude.com/en/api/agent-sdk/typescript — implementation must follow the SDK's `query()` / agent patterns described there, not invent a custom loop.
- **Scaffolding**: This integrates the SDK into an existing package; the `/new-sdk-app` command (from the `agent-sdk-dev` plugin) is NOT appropriate here — it scaffolds standalone SDK apps. Reference its generated patterns only as a guide.

### membank setup command flow
- **Location**: `packages/cli/src/index.ts:219-315`
- **Current flow**: Detects harnesses → writes MCP configs → downloads embedding model
- **Opt-in pattern**: --yes flag skips prompts; interactive mode uses @clack/prompts
- **Model download**: packages/cli/src/setup/model-downloader.ts handles caching
- **Synthesis opt-in location**: Integrate into SetupOrchestrator.run() flow
- **Config write**: New membank config set/get commands handle ~/.membank/config.json

---

## Decision Log

| Decision | Status | Notes |
|----------|--------|-------|
| Syntheses replace verbatim pinned injection | ✓ Confirmed | When synthesis exists and not in-flight, use it. Fallback to pinned if absent/in-flight. |
| Pinning semantics: pinned = fidelity signal | ✓ Confirmed | Pinned memories weighted as higher-quality in synthesis, not injected verbatim. |
| Separate global + per-project syntheses | ✓ Confirmed | Two scopes: scope='global' and scope=<project-scope-hash>. |
| Bootstrap synthesis at server start | ✓ Confirmed | Trigger synthesis for all scopes on MCP init. Debounce prevents hammering. |
| Adaptive 45s debounce | ✓ Design TBD | Fires 45s after last dirty flag; recommend exponential backoff on failures. |
| Per-scope in-flight guard | ✓ Confirmed | Don't start synthesis if one running; timeout after 2min prevents deadlock. |
| 30-day staleness TTL | ✓ Confirmed | Re-synthesize if now - synthesized_at > 30 days, even if not dirty. |
| Drift detection via SHA-256 | ✓ Confirmed | Hash all memory content; if changed, mark dirty and re-synthesize. |
| Uses Claude Haiku via agent SDK | ✓ Confirmed | @anthropic-ai/agent-sdk manages agent lifecycle. Log token usage. |
| CLAUDE_CODE_OAUTH_TOKEN for auth | ✓ Confirmed | SDK uses env var. Fallback: warn and skip if missing (don't crash). |
| Opt-in via setup or config command | ✓ Confirmed | Setup prompt and membank config set synthesis.enabled true. Default: false. |
| New syntheses table | ✓ Confirmed | Schema: id, scope, content, source_memory_hash, synthesized_at, expires_at, in_flight_since. |
| SynthesisEngine class in @membank/mcp | ✓ Confirmed | Manages agent loop, dirty tracking, debounce, startup scan, in-flight guard. |
| SessionContextBuilder integration | ✓ Confirmed | Check syntheses table first; fallback to pinned if miss/in-flight. |

### Open ambiguities discovered:

1. **Config file schema**: Full schema not specified. Recommend: { synthesis: { enabled, maxTokensPerRun?, debounceMs?, stalenessDays?, inFlightTimeoutMs? } }
2. **Synthesis prompt**: Not specified. Recommend system prompt: "Synthesize LLM session memory. Pinned memories higher fidelity. Exclude unrelated facts."
3. **Error recovery**: What if synthesis fails? Recommend: retry 3x, log error, fallback to pinned. Don't crash.
4. **Memory budget**: All memories or subset? Recommend: query top 100 by access_count to prevent token explosion.
5. **Return type change**: SessionContext currently { stats, pinnedGlobal, pinnedProject }. Add optional synthesis?: string field.


---

## Architecture

### Synthesis Lifecycle

```
Server Start → SynthesisEngine.init()
  ├─ Check synthesis.enabled from config
  ├─ Query all scopes (global + projects)
  ├─ For each scope: check if valid (not expired, not stale)
  ├─ If missing/expired: queue for synthesis
  └─ Start debounce loop (runs every 45s)

Debounce Loop (every 45s)
  ├─ For each scope in dirty queue:
  │  ├─ Check if in-flight; skip if true
  │  ├─ Check if already synthesized + valid; skip if true
  │  ├─ Mark in_flight_since = now
  │  ├─ Call Agent SDK loop:
  │  │  ├─ Query get_memory_summary()
  │  │  ├─ Query query_memory()
  │  │  ├─ Construct synthesis prompt with pinned as high-fidelity
  │  │  ├─ Run Claude Haiku (max 3 turns)
  │  │  └─ Extract final synthesis as string
  │  ├─ Write to syntheses table
  │  ├─ Clear in_flight_since
  │  └─ Remove scope from dirty queue
  └─ Sleep 45s

Memory Write Hook (when save/update/delete called)
  ├─ Compute SHA-256 hash of memory content
  ├─ For each affected scope (global + project):
  │  ├─ Recompute source_memory_hash by hashing all memories in scope
  │  ├─ Compare to stored source_memory_hash in syntheses table
  │  ├─ If diverged: mark scope dirty, queue for resynthesis
  │  └─ If identical: no action (synthesis still valid)
  └─ Return

SessionContextBuilder.getSessionContext(projectHash)
  ├─ Check synthesis.enabled from config
  ├─ Query syntheses for scope (global + projectHash)
  ├─ If synthesis hit + valid:
  │  ├─ Return { stats, synthesis: synth.content, pinnedGlobal: [], pinnedProject: [] }
  │  └─ (synthesis replaces pinned injection)
  ├─ Else if synthesis absent or in-flight:
  │  ├─ Fall back to old behavior: { stats, pinnedGlobal, pinnedProject }
  │  └─ (verbatim pinned injection as fallback)
  └─ (Synthesis feature gracefully degrades)

On Shutdown
  ├─ SynthesisEngine.shutdown()
  ├─ Cancel any in-flight synthesis requests (with grace period)
  └─ Persist in-flight state to allow recovery on restart
```

### Per-Scope Concurrency Model

Each scope (global or project) has independent in-flight state:
- `in_flight_since: ISO8601 | null` in `syntheses` table
- If in-flight and older than 2min: assume stale, allow new synthesis to start
- If in-flight and younger than 2min: skip synthesis, wait for next debounce cycle
- No locking beyond this; relies on single-threaded debounce loop

### Drift Detection Mechanism

```typescript
// Stored in syntheses table
interface SynthesisRow {
  source_memory_hash: string;  // SHA-256 of JSON.stringify(all memories in scope)
  synthesized_at: string;      // ISO8601 timestamp
  expires_at: string;          // synthesized_at + 30 days
}

// On dirty-flag check (called after every memory mutation)
function checkDrift(scope: string): boolean {
  const current = hashMemoriesInScope(scope);
  const stored = db.query('SELECT source_memory_hash FROM syntheses WHERE scope = ?', [scope]);
  return current !== stored.source_memory_hash;
}

// Drift detected → mark dirty, queue resynthesis
```

### Fallback Path

```typescript
SessionContextBuilder.getSessionContext(projectHash) {
  if (!config.synthesis.enabled) {
    // Synthesis disabled → always use pinned injection
    return buildPinnedContext();
  }

  const synthesis = db.query('SELECT * FROM syntheses WHERE scope = ?', [projectHash]);

  if (!synthesis) {
    // No synthesis yet → use pinned injection (bootstrap will create one soon)
    return buildPinnedContext();
  }

  if (isSynthesisStale(synthesis) || synthesis.in_flight_since) {
    // Synthesis expired or in-flight → fall back to pinned
    return buildPinnedContext();
  }

  // Synthesis valid → use it
  return { stats, synthesis: synthesis.content, pinnedGlobal: [], pinnedProject: [] };
}
```

---

## Schema

### New Migration (version 4)

**File**: `packages/core/src/db/manager.ts` (append to MIGRATIONS array)

```sql
CREATE TABLE IF NOT EXISTS syntheses (
  id                  TEXT PRIMARY KEY,
  scope               TEXT NOT NULL,
  content             TEXT NOT NULL,
  source_memory_hash  TEXT NOT NULL,
  synthesized_at      TEXT NOT NULL,
  expires_at          TEXT NOT NULL,
  in_flight_since     TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE(scope),
  CHECK(expires_at > synthesized_at)
);

CREATE INDEX IF NOT EXISTS idx_syntheses_expires_at
  ON syntheses(expires_at);

CREATE INDEX IF NOT EXISTS idx_syntheses_scope_inflight
  ON syntheses(scope) WHERE in_flight_since IS NOT NULL;
```

**Scope values**:
- `'global'` for global synthesis
- `<project-scope-hash>` for per-project (same hash as `projects.scope_hash`)

**Key constraints**:
- UNIQUE(scope): only one synthesis per scope
- expires_at > synthesized_at: sanity check
- Index on expires_at: for querying stale syntheses
- Index on scope WHERE in_flight_since: for fast in-flight checks

### Config Schema

**File**: `~/.membank/config.json` (user home directory)

```typescript
interface MemBankConfig {
  synthesis?: {
    enabled: boolean;                    // default: false (opt-in)
    maxTokensPerRun?: number;            // default: 2000 (Haiku limit)
    debounceMs?: number;                 // default: 45000 (45s)
    stalenessDays?: number;              // default: 30
    inFlightTimeoutMs?: number;          // default: 120000 (2min)
  };
}
```

**Example**:
```json
{
  "synthesis": {
    "enabled": true,
    "maxTokensPerRun": 2000,
    "debounceMs": 45000,
    "stalenessDays": 30
  }
}
```


---

## Files to Change

### @membank/core

1. **`packages/core/src/db/manager.ts`**
   - Add migration 4: `CREATE TABLE syntheses(...)`
   - Increment MIGRATIONS array entry

2. **`packages/core/src/synthesis/repository.ts`** (NEW)
   - Class `SynthesisRepository` (mirrors `MemoryRepository` pattern)
   - Methods:
     - `saveSynthesis(scope: string, content: string, sourceHash: string): Synthesis`
     - `getSynthesis(scope: string): Synthesis | undefined`
     - `markInFlight(scope: string): void`
     - `clearInFlight(scope: string): void`
     - `markDirty(scope: string): void`
     - `getDirtySyntheses(): { scope: string; isDirty: boolean; isInFlight: boolean }[]`
     - `computeSourceMemoryHash(scope: string): string` (SHA-256 of all memories in scope)
     - `expireSyntheses(): void` (delete where expires_at < now)

3. **`packages/core/src/synthesis/index.ts`** (NEW)
   - Export `SynthesisRepository` and related types

4. **`packages/core/src/session/builder.ts`**
   - Add new method `getSessionContextWithSynthesis(projectHash: string, synthesis: string | null): SessionContext`
   - Extend `SessionContext` type to include optional `synthesis?: string` field
   - Update `getSessionContext()` to check for synthesis and fall back to pinned if not available

5. **`packages/core/src/types.ts` (via schemas.ts)**
   - Add `SynthesisSchema` (id, scope, content, sourceHash, synthesizedAt, expiresAt, inFlightSince, createdAt, updatedAt)
   - Export `Synthesis` type

6. **`packages/core/src/memory/repository.ts`**
   - Add method `flag_for_review(memoryId: string, reason: 'manual' | 'drift'): void`
   - (Part of #31 dependency, but needed here for drift detection)

### @membank/mcp

1. **`packages/mcp/src/synthesis/engine.ts`** (NEW)
   - Class `SynthesisEngine`
   - Constructor: `(db: DatabaseManager, config: SynthesisConfig)`
   - Methods:
     - `init(): Promise<void>` (run bootstrap, start debounce loop)
     - `shutdown(): Promise<void>` (graceful cleanup)
     - `markDirty(scope: string): void` (called by memory writes)
     - `_debounceLoop(): Promise<void>` (internal, runs every 45s)
     - `_synthesizeScope(scope: string): Promise<void>` (calls agent SDK, writes to DB)
     - `_buildSynthesisPrompt(scope: string): Promise<string>` (constructs prompt with memories)

2. **`packages/mcp/src/synthesis/agent-loop.ts`** (NEW)
   - Class `SynthesisAgentLoop`
   - Uses `@anthropic-ai/claude-agent-sdk` — follow the SDK's documented `query()` API and agent patterns from https://docs.claude.com/en/api/agent-sdk/typescript. Do not invent a custom loop on top of the raw Anthropic SDK.
   - Methods:
     - `run(prompt: string, scope: string): Promise<string>` (runs Claude Haiku via Agent SDK)
     - Handles tool use: `query_memory`, `get_memory_summary` (calls back to core services as in-process MCP tools or SDK-style custom tools per SDK docs)
     - Implements max-turns limit (e.g., 3 turns)
     - Returns final synthesis text

3. **`packages/mcp/src/server.ts`**
   - Import `SynthesisEngine` in `CoreServices` interface (add field `synthesis?: SynthesisEngine`)
   - In `initCore()`: instantiate `SynthesisEngine` if config.synthesis.enabled
   - Call `engine.init()` in `startServer()` before server connects to transport
   - Call `engine.shutdown()` on SIGTERM/SIGINT
   - On memory mutations (save/update/delete): call `engine.markDirty(scope)`
   - Update `SessionContextBuilder` usage in inject-like contexts to include synthesis

4. **`packages/mcp/src/synthesis/index.ts`** (NEW)
   - Export `SynthesisEngine` and related types

### @membank/cli

1. **`packages/cli/src/config/manager.ts`** (NEW)
   - Class `ConfigManager`
   - Methods:
     - `load(): MemBankConfig`
     - `set(key: string, value: unknown): void` (e.g., `synthesis.enabled`)
     - `get(key: string): unknown`
     - `write(): void` (persist to `~/.membank/config.json`)

2. **`packages/cli/src/commands/config.ts`** (NEW)
   - New command: `membank config`
   - Subcommands:
     - `config get <key>` → print config value as JSON
     - `config set <key> <value>` → set and persist
     - `config show` → print entire config
   - Example: `membank config set synthesis.enabled true`

3. **`packages/cli/src/commands/synthesize.ts`** (NEW)
   - New command: `membank synthesize`
   - Subcommands:
     - `synthesize --scope <scope>` → manually trigger synthesis for a scope (force re-run)
     - `synthesize show [--scope <scope>]` → display current synthesis content

4. **`packages/cli/src/setup/setup-orchestrator.ts`**
   - In `run()` method, after model download: add synthesis opt-in prompt
   - Question: "Enable memory synthesis? (experimental feature that summarizes memories at session start)"
   - Write `synthesis.enabled = true` to config if answered yes
   - Update `out()` callback to show synthesis setup step

5. **`packages/cli/src/index.ts`**
   - Register `config` command (line ~220, before/after `setup`)
   - Register `synthesize` command
   - Both commands follow existing pattern: parse args → call command handler → formatter.output()

6. **`packages/cli/src/commands/inject.ts`**
   - Update `formatContext()` to check for synthesis field in SessionContext
   - If synthesis present and not in-flight: use it instead of pinned memories
   - Still fall back to pinned if synthesis absent
   - Output: updated XML with `<synthesis>` block instead of `<pinned-memories>`


---

## SDK Reference & Verification

This is the only feature in the membank repo that consumes `@anthropic-ai/claude-agent-sdk`. To stay aligned with current SDK best practices:

1. **Reference docs at implementation time**: https://docs.claude.com/en/api/agent-sdk/typescript — fetch via WebFetch or context7 before writing the agent loop. The SDK evolves; do not rely on training-data knowledge.
2. **Final verification gate**: After implementation, invoke the `agent-sdk-verifier-ts` agent (from the `agent-sdk-dev` plugin) scoped to `packages/mcp/`. The verifier checks:
   - `@anthropic-ai/claude-agent-sdk` installed and reasonably current
   - `"type": "module"` present (already satisfied)
   - Correct SDK imports and `query()` usage
   - Agent initialization, system prompt, model selection
   - Custom tool / MCP integration patterns
   - Permissions configuration if used
   - Error handling around SDK calls
   - `.env.example` documents the auth env var (`CLAUDE_CODE_OAUTH_TOKEN` per issue, or `ANTHROPIC_API_KEY` if that's what the SDK supports)
3. **Treat verifier output as a blocking gate**: PASS or PASS WITH WARNINGS required before merge. Critical issues must be resolved.

## Tests

### Unit Tests

**`packages/core/src/synthesis/repository.test.ts`**:
1. `saveSynthesis()` writes to DB, returns Synthesis
2. `getSynthesis()` returns synthesis or undefined
3. `computeSourceMemoryHash()` consistent hash
4. `expireSyntheses()` deletes expired

**`packages/mcp/src/synthesis/engine.test.ts`**:
1. `init()` queries scopes, marks expired
2. `markDirty()` adds scope to dirty queue
3. `_debounceLoop()` processes dirty queue
4. Debounce burst: 100 calls -> 1 synthesis per scope
5. In-flight guard: skip if running
6. Timeout recovery: stale in-flight allowed

**`packages/mcp/src/synthesis/agent-loop.test.ts`**:
1. `run()` calls Agent SDK, returns synthesis
2. Tool routing: query_memory, get_memory_summary routed
3. Max turns: stops after 3
4. Token limit: respects cap
5. Error handling: timeout logged

**`packages/cli/src/config/manager.test.ts`**:
1. `load()` reads from config.json
2. `set()/get()` updates state
3. `write()` persists to file
4. Missing file creates with defaults
5. Invalid JSON handled gracefully

### Integration Tests

**server.test.ts (additions)**:
1. Server init with synthesis enabled -> engine instantiated
2. Server init with synthesis disabled -> no engine
3. Memory save -> markDirty called
4. Full flow: save -> debounce -> synthesis -> inject
5. Fallback: no synthesis -> pinned injection

**setup-orchestrator.test.ts (additions)**:
1. Setup with opt-in -> config.json written
2. Setup without -> synthesis.enabled = false

### Acceptance Criteria

1. Bootstrap: Server starts -> syntheses for all scopes within 45s
2. Debounce burst: 50 saves -> 1 synthesis per scope
3. Drift: modify memory -> dirty -> new synthesis within 45s
4. Fallback: no synthesis -> pinned injection
5. Opt-in: synthesis.enabled=false -> no engine
6. Per-project: two projects, modify one -> only that resynthesized
7. Timeout: stale in-flight (2min+) -> new allowed
8. OAuth missing: warning, skip, continue

---

## Changeset

After implementation, run: pnpm changeset

### Changeset 1: Core schema
**Packages**: @membank/core  
**Bump**: minor  
**Description**:
```
Add synthesis table and SynthesisRepository for memory summarization.
Migration 4 adds syntheses table. SessionContext extended with optional
synthesis field. Prerequisite for synthesis engine.
```

### Changeset 2: Synthesis engine
**Packages**: @membank/mcp  
**Bump**: minor  
**Description**:
```
Add SynthesisEngine for background memory synthesis via Claude Haiku.
Adaptive 45s debounce, per-scope in-flight guards, SHA-256 drift
detection, 30-day TTL. Synthesis replaces pinned injection when
available; falls back gracefully when absent/in-flight.
```

### Changeset 3: CLI config
**Packages**: @membank/cli  
**Bump**: minor  
**Description**:
```
Add config system and synthesis management commands.
ConfigManager for ~/.membank/config.json. Commands: membank config
(get/set/show), membank synthesize (--scope, show). Synthesis opt-in
integrated into setup.
```

---

## Dependencies

### Hard dependencies:
- **#33** (get_memory_summary): Engine calls this first
- **#31** (list_flagged_memories, resolve_review): Engine will use for dedup

### Soft (recommended first):
- **#27** (query_memory provenance): Better metadata
- **#28** (cosine scoring): Better filtering

### Interacts with:
- **#34** (pin budget warning): Coordinate synthesis.enabled flag

---

## Risks & Mitigations

### Risk 1: CLAUDE_CODE_OAUTH_TOKEN absent
**Problem**: Synthesis fails silently  
**Mitigation**: Log warning, skip synthesis, fallback to pinned. Dont crash.

### Risk 2: Long-running background work
**Problem**: MCP server accumulates state over hours  
**Mitigation**: Graceful shutdown SIGTERM/SIGINT, persist in DB, recover on restart.

### Risk 3: Token cost explosion
**Problem**: Agent SDK uses more tokens than expected  
**Mitigation**: Log usage, cap frequency (45s + 30d TTL), cap tokens/run (2000), opt-in only.

### Risk 4: Synthesis quality issues
**Problem**: Misses important or hallucinates  
**Mitigation**: Pinned weighted higher, include summary, limit to top 100 memories, optional.

### Risk 5: In-flight sync bugs
**Problem**: Concurrent synthesis runs  
**Mitigation**: DB UNIQUE(scope), 2min timeout, per-scope concurrency.

---

## Additional Notes

- Config persists at ~/.membank/config.json across CLI restarts
- Synthesis reused across harness sessions per scope
- Log runs to stderr (duration, tokens, scope) for transparency
- Dashboard can show synthesis status — future UI enhancement
- Recommend starting with unit tests; defer integration if scope creeps
