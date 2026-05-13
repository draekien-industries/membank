# Issue #32: Add type reclassification to update_memory

**Issue Reference:** GitHub Issue #32  
**Problem Statement:** `update_memory` does not support changing a memory's type. Users must delete and recreate memories to reclassify types, which loses historical data (createdAt, accessCount, reviewEvents).

## User Impact

- Type misclassifications cannot be corrected without data loss
- Historical metadata (access count, review events) is lost on delete+recreate
- Forcing users to choose between keeping history or fixing type classification

## Technical Analysis

### Current Implementation

**`MemoryPatchSchema` (packages/core/src/schemas.ts:85-88)**

Accepts only `content` and `tags`. The `type` field is absent, making reclassification impossible.

**`MemoryRepository.update()` (packages/core/src/memory/repository.ts:138-183)**

- Lines 155-163: Conditionally updates `content` and `tags`
- Lines 168-174: **Embedding recomputation only triggered if `content !== undefined`**
- Does not handle `type` field

**`UpdateMemoryArgsSchema` (packages/mcp/src/schemas.ts:11-15)**

- No `type` field
- `content` is required (should be optional)

**Server tool definition (packages/mcp/src/server.ts:106-121)**

- Tool input schema does not include `type` property
- Tool description states "content and/or tags" — needs update

### Data Preservation

The update path preserves:
- `id` — unchanged (primary key)
- `createdAt` — unchanged (set in save, never modified)
- `accessCount` — unchanged (only incremented separately)
- `updatedAt` — always refreshed to current timestamp
- `reviewEvents` — unchanged (separate table, not touched by update)

## Implementation Plan

### Step 1: Update `MemoryPatchSchema`

**File:** `packages/core/src/schemas.ts`  
**Changes:**
- Add `type: MemoryTypeSchema.optional()` to `MemoryPatchSchema`
- All three fields (`content`, `tags`, `type`) remain optional

### Step 2: Update `MemoryRepository.update()`

**File:** `packages/core/src/memory/repository.ts`  
**Changes:**

1. **Extract type from patch (line 139):**
   - Destructure `type` along with `content` and `tags`

2. **Add type to UPDATE statement (lines 155-163):**
   - Add conditional: if type !== undefined, push "type = ?" to sets and value to values array
   - Insert in the correct position within the dynamic SQL builder

3. **Skip embedding recomputation when appropriate (lines 168-174):**
   - **CRITICAL:** Only recompute embeddings if `content !== undefined`
   - Type-only changes do not require re-embedding
   - Preserve existing condition: `if (content !== undefined) { ... }`
   - **Rationale:** Embeddings are computed from content semantic meaning; type is metadata

**Key Logic:**
- Always update `updated_at` to current timestamp
- Only update `content` if provided in patch
- Only update `tags` if provided in patch
- Only update `type` if provided in patch
- Only recompute embedding if `content` was provided in patch

### Step 3: Update `UpdateMemoryArgsSchema`

**File:** `packages/mcp/src/schemas.ts`  
**Changes:**

1. Make `content` optional (change from required to `.optional()`)
2. Add `type: MemoryTypeSchema.optional()`

### Step 4: Update MCP tool definition

**File:** `packages/mcp/src/server.ts`  
**Location:** Lines 105-121 (update_memory tool)  
**Changes:**

1. Update tool description to mention type reclassification
2. Make `content` optional in required array: change required from `["id", "content"]` to `["id"]`
3. Add `type` property to inputSchema properties with enum of MEMORY_TYPE_VALUES
4. Update tool handler (lines 235-248) to pass `type: args.type` to `core.repo.update()`

## Key Design Decisions

### Embedding Skip Condition
- **Condition:** Skip embedding recomputation when `content === undefined`
- **Rationale:** Type changes do not affect semantic meaning; embeddings encode content, not metadata
- **Benefit:** Avoids unnecessary computation and external API calls for metadata-only updates
- **Note:** If a type change occurs alongside content change, both the content and its embedding are updated (new content → new embedding)

### All Fields Optional
- Users can update any combination: type alone, content alone, type+content+tags, etc.
- Preserves backward compatibility (existing code that updates only content continues to work)
- Matches pattern of PATCH semantics (partial updates)

### Data Preservation
- `createdAt` and `accessCount` are never touched in update logic
- `reviewEvents` are in a separate table and persist independently
- Explicitly updating only `updatedAt` to new timestamp (as before)

## Files Modified

1. `packages/core/src/schemas.ts` — Add `type` to `MemoryPatchSchema`
2. `packages/core/src/memory/repository.ts` — Handle type in `update()`, preserve embedding skip logic
3. `packages/mcp/src/schemas.ts` — Make content optional, add type to `UpdateMemoryArgsSchema`
4. `packages/mcp/src/server.ts` — Update tool definition and handler

## Backward Compatibility

- ✅ Existing calls with only content are unaffected (content still accepted, optional now)
- ✅ Existing calls with content + tags work as before
- ✅ New calls can supply type alone, content alone, or any combination
- ✅ No database migration required (type column already exists)

## Success Criteria

1. MemoryPatchSchema accepts `type` as optional field
2. MemoryRepository.update() applies type change to database
3. Embedding recomputation skipped when only type (or only tags) is updated
4. UpdateMemoryArgsSchema in MCP makes content optional and accepts type
5. update_memory tool in server.ts accepts type in input and passes it through
6. All existing tests pass; new tests cover type reclassification scenarios
