# Issue #31: Add list_flagged_memories and resolve_review MCP tools

**Status**: Ready to implement
**Unblocks**: #35 (synthesis agent uses these tools to triage near-duplicates)
**Difficulty**: Low (pure MCP surface exposure, all core logic exists)

## Problem Statement

The deduplication system flags memories with 0.75–0.92 cosine similarity as `needs_review` with details stored in the `memory_review_events` table. The repository methods `MemoryRepository.listFlagged()` and `MemoryRepository.resolveReviewEvents()` are fully implemented, but no MCP tools expose this queue to agents.

**Current state**:
- `memory_review_events` table stores: `id`, `memory_id`, `conflicting_memory_id`, `similarity`, `conflict_content_snapshot`, `reason`, `created_at`, `resolved_at`
- `listFlagged()` returns `Memory[]` with populated `reviewEvents` array (unresolved only)
- `resolveReviewEvents(memoryId)` marks all open events for a memory as resolved
- Dashboard CLI has `membank review` command that calls these, but agents have no access

**Impact**: Synthesis agents (#35) cannot triage the review queue, leaving near-duplicate conflicts unresolved.

## Success Criteria

1. New MCP tool `list_flagged_memories` registered in `packages/mcp/src/server.ts`
   - Input schema: `{}`
   - Returns `Memory[]` with full `reviewEvents` array
   - Each reviewEvent includes `similarity`, `conflictContentSnapshot`, `conflictingMemoryId`
2. New MCP tool `resolve_review` registered in `packages/mcp/src/server.ts`
   - Input schema: `{ id: string }`
   - Calls `core.repo.resolveReviewEvents(id)`
   - Returns `{ success: true, id: string }`
3. Both tools follow existing MCP registration pattern (tool list + handler)
4. No new repository methods required (already exist)
5. Minimal schema additions (two Zod objects for args validation)


## Verification

### MemoryRepository methods (packages/core/src/memory/repository.ts)

**Lines 230–250** — `listFlagged()`:
- Returns: `Memory[]` where each Memory has `reviewEvents: ReviewEvent[]` (unresolved only)
- No parameters
- SQL filters: `WHERE EXISTS (SELECT 1 FROM memory_review_events e WHERE e.memory_id = memories.id AND e.resolved_at IS NULL)`

**Lines 267–274** — `resolveReviewEvents(memoryId: string)`:
- Signature: `(memoryId: string) => void` (returns nothing, updates in-place)
- SQL: `UPDATE memory_review_events SET resolved_at = ? WHERE memory_id = ? AND resolved_at IS NULL`

### ReviewEvent shape (packages/core/src/schemas.ts:28–38)

```ts
{
  id: string,
  memoryId: string,
  conflictingMemoryId: string | null,
  similarity: number,           // cosine similarity 0.75–0.92
  conflictContentSnapshot: string,  // the conflicting memory's content
  reason: "similarity_dedup",
  createdAt: string,
  resolvedAt: string | null
}
```

### Memory includes reviewEvents

Memory type (packages/core/src/schemas.ts:52–65) includes `reviewEvents: ReviewEvent[]`.

### Existing MCP pattern (packages/mcp/src/server.ts)

**Tool registration** (lines 73–199):
- Each tool is an object with `name`, `description`, `inputSchema`
- `inputSchema` is JSON Schema (not Zod) with `type: "object"`, `properties`, `required`
- Empty input tools use `inputSchema: { type: "object", properties: {}, required: [] }`

**Handler pattern** (lines 202–359):
- All handlers in `CallToolRequestSchema` request handler
- Args parsed via Zod: `const args = parseArgs(ArgsSchema, request.params.arguments)`
- Success: `{ content: [{ type: "text", text: JSON.stringify(result) }] }`
- Error: `{ content: [{ type: "text", text: message }], isError: true }`

### No flag_for_review method

Confirmed: no `flag_for_review` or `flagForReview` methods exist in repository.ts. Flagging happens automatically during dedup. Agents only need to resolve.


## Implementation Plan

### Step 1: Add Zod schemas for MCP arguments

**File**: `packages/mcp/src/schemas.ts`

Add at end of file:
```ts
export const ListFlaggedMemoriesArgsSchema = z.object({});

export const ResolveReviewArgsSchema = z.object({
  id: z.string().min(1),
});
```

### Step 2: Register tools in tool list

**File**: `packages/mcp/src/server.ts`, after `unpin_memory` tool definition

Add to tools array before closing bracket:
```ts
{
  name: "list_flagged_memories",
  description:
    "List memories flagged for review due to near-duplicate similarity (0.75–0.92 cosine match). Returns memories with reviewEvents containing conflict details: similarity score, conflicting memory ID, and snapshot of the conflict.",
  inputSchema: { type: "object", properties: {}, required: [] },
},
{
  name: "resolve_review",
  description:
    "Mark all open review events for a memory as resolved. Call this after triaging a near-duplicate conflict.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Memory id to resolve review events for" },
    },
    required: ["id"],
  },
},
```

### Step 3: Implement tool handlers

**File**: `packages/mcp/src/server.ts`, in `CallToolRequestSchema` handler

Add before final `throw new Error`:
```ts
if (request.params.name === "list_flagged_memories") {
  try {
    const memories = core.repo.listFlagged();
    return {
      content: [{ type: "text", text: JSON.stringify(memories) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

if (request.params.name === "resolve_review") {
  const args = parseArgs(ResolveReviewArgsSchema, request.params.arguments);

  try {
    core.repo.resolveReviewEvents(args.id);
    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, id: args.id }) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}
```

### Step 4: Import new schemas

**File**: `packages/mcp/src/server.ts`, lines 21–28

Update import statement to include new schemas:
```ts
import {
  DeleteMemoryArgsSchema,
  ListFlaggedMemoriesArgsSchema,
  MigrateArgsSchema,
  PinMemoryArgsSchema,
  QueryMemoryArgsSchema,
  ResolveReviewArgsSchema,
  SaveMemoryArgsSchema,
  UpdateMemoryArgsSchema,
} from "./schemas.js";
```


## Files to change

1. `packages/mcp/src/schemas.ts` — Add 2 Zod schemas
2. `packages/mcp/src/server.ts` — Add tool registrations + handlers + import

## Semantic decisions

- **list_flagged_memories returns full Memory objects**: Agents need to inspect `conflictContentSnapshot` and `similarity` to decide how to resolve. Returning just `ReviewEvent[]` would lose context.

- **resolve_review is non-destructive**: It marks events as "triaged" (resolved_at set) but doesn't delete them. This preserves audit trail. If agents want to delete near-duplicates, they use `delete_memory` separately.

- **no bulk resolve**: Each resolve_review call takes one memory ID. This forces agents to be deliberate (one decision at a time), not batch-delete accidentally.

- **no resolve by event ID**: We resolve all events for a memory at once (by memory_id), not individual review event IDs. This matches the CLI behavior and is simpler semantics (one review per memory, all conflicts for that memory resolved together).

## Relationship to #35 (synthesis agent)

Issue #35 implements a synthesis agent that uses the dedup review queue to:
1. Call `list_flagged_memories` to see what memories conflict
2. Inspect `conflictContentSnapshot` + `similarity` to understand why
3. Call `resolve_review` to mark triaged (or `delete_memory` to remove duplicates)

**This issue (#31) UNBLOCKS #35**. Without these MCP tools, the synthesis agent has no way to interact with the review queue.

Note: #35 mentions `flag_for_review` as a tool name — this is likely a misnaming in the original issue description. The actual need is:
- **list_flagged_memories** (to see the queue)
- **resolve_review** (to mark triaged)
- No explicit flag method needed (flagging happens automatically during dedup)

If #35 needs to explicitly flag a memory (outside dedup), a new repository method would need to be added. But based on the dedup logic in MemoryRepository.save(), all flagging is automatic (lines 109–116).


## Tests

Basic smoke tests should verify:
1. `list_flagged_memories` returns empty array when no conflicts exist
2. After creating 2 near-duplicate memories (0.75–0.92 similarity), `list_flagged_memories` returns 1 Memory with non-empty `reviewEvents`
3. `reviewEvents[0]` includes correct `similarity`, `conflictContentSnapshot`, `conflictingMemoryId`
4. After calling `resolve_review(id)`, subsequent `list_flagged_memories` calls exclude that memory
5. Error handling: `resolve_review` with non-existent ID still returns success (no-op, no error thrown)

Existing test pattern in `packages/mcp/src/server.test.ts` can be reused (see pin_memory/unpin_memory pattern).

## Acceptance criteria

- [ ] `ListFlaggedMemoriesArgsSchema` defined in schemas.ts
- [ ] `ResolveReviewArgsSchema` defined in schemas.ts
- [ ] `list_flagged_memories` tool registered in tool list
- [ ] `resolve_review` tool registered in tool list
- [ ] Both tool handlers implemented and wired
- [ ] Imports updated in server.ts
- [ ] Tests added (or verified via existing integration tests)
- [ ] No changes to core repository — pure MCP surface exposure

## Changeset

```
minor @membank/mcp — Add list_flagged_memories and resolve_review MCP tools to expose dedup review queue.
```

## Dependencies

- **Unblocks #35** (synthesis agent) — this issue provides the MCP surface for agents to access the review queue
- Depends on: memory_review_events table (#24 already merged) and repository methods (already exist)

## Risk / notes

**Zero risk**: All logic is in place. This is purely adding MCP tool wrappers around existing methods. No database changes, no algorithm changes, no breaking changes.

**Audit trail preserved**: Resolved events stay in the table with `resolved_at` timestamp, enabling audit queries later.

**No cascading deletes**: Resolving a review event doesn't delete the memory or the conflicting memory. Agents must call `delete_memory` separately if they want to remove duplicates. This is intentional — resolution and deletion are orthogonal decisions.

**Simplicity**: Only 2 tools needed. No need for bulk operations, filtering by similarity threshold, or other complex features. Agents can implement that logic on top of these primitives.

