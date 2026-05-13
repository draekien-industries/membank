# Issue #33: Add get_memory_summary MCP tool for pre-query session orientation

**Status**: Ready to implement  
**Blocks**: #35 (synthesis agent calls `get_memory_summary` first to understand memory store shape)  
**Difficulty**: Low (single MCP tool + minimal core change)

## Problem Statement

When an agent starts a session, it has no way to understand the shape of the memory store without blind `query_memory` calls. The tool needs to return:
- Total memory count
- Breakdown by type (correction, preference, decision, learning, fact)
- Pinned count (memories injected into session context)
- Count of memories flagged for review (unresolved dedup conflicts)

`SessionContextBuilder.getSessionContext()` already computes type counts internally, but this is not exposed via MCP. The `list_memory_types` tool only returns enum values, not counts.

## Success Criteria

1. New MCP tool `get_memory_summary` registered in `packages/mcp/src/server.ts` alongside existing tools
2. Tool schema accepts empty input (`{}`), no filtering parameters
3. Response returns all four fields: `{ total, byType, pinned, needsReview }`
4. No scoping parameter — tool returns aggregate stats across all scopes (global + all projects)
5. `MemoryRepository.stats()` signature expanded to include `pinned` count
6. Tool tested and documented in existing test pattern

## Implementation Plan

### Step 1: Expand `MemoryRepository.stats()` signature
**File**: `packages/core/src/memory/repository.ts`

Current signature (line 302):
```ts
stats(): { byType: Record<MemoryType, number>; total: number; needsReview: number }
```

**Change**: Add `pinned` count to return shape
```ts
stats(): { 
  byType: Record<MemoryType, number>
  total: number
  pinned: number        // NEW: count of memories where pinned = 1
  needsReview: number 
}
```

**Implementation**:
- Add a single SQL query to count `WHERE pinned = 1` (reuse pattern from `needsReview` query)
- Append `pinned` field to return object

**Why**: The pinned count is critical for synthesis agent (#35) to understand session context budget and validate injection pipeline. All other fields already exist in the response.

### Step 2: Add MCP tool registration
**File**: `packages/mcp/src/server.ts`

**Location**: Add to tool list (lines 73–199), after `list_memory_types` (before `save_memory`)

**Schema**:
```ts
{
  name: "get_memory_summary",
  description: "Returns aggregate metadata about the memory store — counts by type, pinned count, flagged count, and total. Call this at session start to orient before querying.",
  inputSchema: { type: "object", properties: {}, required: [] }
}
```

**Return shape** (exact JSON structure):
```json
{
  "total": 42,
  "byType": { "correction": 7, "preference": 5, "decision": 18, "learning": 11, "fact": 1 },
  "pinned": 4,
  "needsReview": 2
}
```

### Step 3: Implement tool handler
**File**: `packages/mcp/src/server.ts`

**Location**: Add handler in `CallToolRequestSchema` block (after `list_memory_types` handler, before `save_memory`)

**Implementation**:
```ts
if (request.params.name === "get_memory_summary") {
  try {
    const stats = core.repo.stats();
    return {
      content: [{ type: "text", text: JSON.stringify(stats) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}
```

**Pattern**: Matches existing tools — direct `core.repo` call, JSON response, error handling via try/catch.

### Step 4: Add test coverage
**File**: `packages/mcp/src/get-memory-summary.test.ts` (new file)

**Test cases**:
1. Empty memory store → `{ total: 0, byType: {all zeros}, pinned: 0, needsReview: 0 }`
2. Store with mixed memories → correct counts per type
3. Store with pinned memories → accurate pinned count
4. Store with flagged memories → accurate needsReview count
5. Empty input object is accepted

**Pattern**: Follow existing test structure (`list-memory-types.test.ts`, `query-memory.test.ts`)

## Scope & Constraints

### What it does NOT do:
- **No filtering**: Tool returns aggregate stats only — no `?scope=` or `?type=` parameters
- **No recent-updates tracking**: Issue body mentioned "most recent update per type" but this is not implemented in existing `stats()`. Keep it out of scope.
- **No project-scoped stats**: Synthesis agent (#35) needs global view first; project filtering can be added later if needed

### Reasoning:
- Synthesis agent (#35) calls this at startup to orient globally before querying specific scopes
- Global stats fit the "session orientation" use case better than per-project breakdowns
- Scoping can be added as a separate enhancement if agents need project-scoped summaries

## Scoping Notes

**Global vs. project scoping decision**: The `stats()` method is called once per scope (global + each project project) in the synthesis engine (#35). There is no need for filtering here — agents will call `get_memory_summary` once to understand overall shape, then `query_memory` with project context to retrieve details.

Current database layout:
- `memory_projects` table links memories to projects
- Memories without project association are "global"
- `stats()` currently returns totals across both global and project-scoped memories

This is correct for orientation — agents need to see the full shape before querying.

## Dependencies

### On other changes:
- **None required** — `stats()` already exists; we are only expanding its return shape
- `MemoryRepository` class is already instantiated as `core.repo` in server.ts

### For other work:
- **Unblocks #35** (synthesis engine) — synthesis agent calls `get_memory_summary` first to understand memory store shape before querying
- **Parallel to #31** (list_flagged_memories, resolve_review tools) — synthesis agent will also call these tools, but #33 is a prerequisite for orientation

## Testing Strategy

1. **Unit test** (`get-memory-summary.test.ts`): mock `MemoryRepository.stats()`, verify tool response shape
2. **Integration test** (optional, `server.test.ts`): create in-memory DB with sample memories, call tool, verify counts
3. **Manual**: run CLI in interactive mode, call via MCP, verify JSON structure

## Files Changed

```
packages/core/src/memory/repository.ts       — expand stats() return type + add pinned query
packages/mcp/src/server.ts                   — register tool + implement handler
packages/mcp/src/get-memory-summary.test.ts  — new test file (follow existing pattern)
```

No changes needed to CLI, dashboard, schemas, or types.

## Changeset Requirements

After implementation, run:
```bash
pnpm changeset
```

Select `@membank/mcp` and `@membank/core` (both affected). Bump type: `minor` (new feature).

**Description** (example):
```
feat: add get_memory_summary MCP tool for session orientation

Agents can now call get_memory_summary to understand memory store shape 
before querying — returns total, byType counts, pinned count, and review queue size.
Unblocks synthesis agent (#35) for pre-query orientation.
```

## Additional Notes

- **HTTP access**: Tool has no HTTP surface — MCP-only (stderr/stdin communication with agents)
- **Permissions**: No new permissions required — read-only query on existing `memories` and `memory_review_events` tables
- **Performance**: Single-pass counting query, O(1) for in-memory DB, instant for typical store sizes
- **Backwards compatibility**: No breaking changes — existing tools unaffected

## Related Issues

- **#35**: Synthesis agent (depends on this) — calls `get_memory_summary` at startup to orient before querying
- **#31**: `list_flagged_memories` and `resolve_review` tools — synthesis agent will also use these for dedup review
- **#29**: `query_memory` scope filtering — synthesis agent will eventually need this for per-project queries
