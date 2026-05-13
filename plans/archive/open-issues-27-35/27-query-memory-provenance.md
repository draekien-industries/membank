# Plan: #27 — query_memory results omit createdAt, updatedAt, and sourceHarness

## Issue
The `query_memory` MCP tool serializes result objects to JSON but excludes three fields that exist on the `Memory` type and in the database: `createdAt`, `updatedAt`, and `sourceHarness`. Clients receive incomplete memory snapshots, losing provenance and temporal context. The fix requires extending the MCP serialisation boundary in `packages/mcp/src/server.ts` lines 287–296 to include the missing fields.

## Verification
- **Memory type definition** (`packages/core/src/schemas.ts:52–64`): `MemorySchema` includes `createdAt: z.string()` (line 62), `updatedAt: z.string()` (line 63), and `sourceHarness: z.string().nullable()` (line 58).
- **QueryEngine.query() return type** (`packages/core/src/query/engine.ts:31`): Returns `Promise<Array<Memory & { score: number }>>`, where `Memory` is the full type including all three fields.
- **rowToMemory() conversion** (`packages/core/src/db/row-types.ts:11–29`): Maps database rows to `Memory` objects with `createdAt` (line 26), `updatedAt` (line 27), and `sourceHarness` (line 22) populated from row fields.
- **SQLite schema** (`packages/core/src/db/row-types.ts`): MemoryRow type confirms `created_at`, `updated_at`, and `source` fields exist and are loaded by the query.
- **Current serialisation** (`packages/mcp/src/server.ts:287–296`): The `query_memory` handler maps results to a shape containing only `{ id, content, type, tags, projects, pinned, reviewEvents, score }`, explicitly omitting the three fields.
- **Existing tests** (`packages/mcp/src/query-memory.test.ts:52–103`): The "happy path" test verifies only the current 8 fields (lines 76–93) and does not check for the missing fields. Tests do not validate `createdAt`, `updatedAt`, or `sourceHarness`.

## Files to change
- `packages/mcp/src/server.ts:287–296` — Extend the serialisation map in the `query_memory` handler to include `createdAt`, `updatedAt`, and `sourceHarness` from the result object.

## Implementation steps
1. Open `packages/mcp/src/server.ts` and locate the `query_memory` handler (line 276).
2. In the serialisation block (lines 287–296), add three new properties to the mapped object:
   - `createdAt: r.createdAt`
   - `updatedAt: r.updatedAt`
   - `sourceHarness: r.sourceHarness`
3. The resulting object shape should be: `{ id, content, type, tags, projects, pinned, reviewEvents, createdAt, updatedAt, sourceHarness, score }`.
4. No database migration is required; the fields already exist in the schema and are hydrated by `rowToMemory()`.
5. Run `pnpm test` to confirm no regressions.

## Tests
- **Extend `packages/mcp/src/query-memory.test.ts` line 52+**: Add assertions to the existing "happy path returns results ranked by score with required fields" test to verify the parsed results include `createdAt`, `updatedAt`, and `sourceHarness` properties with appropriate types and non-null/nullable patterns:
  - `createdAt` and `updatedAt` should be ISO 8601 date strings.
  - `sourceHarness` should be a string or null.
- **Optional**: Add a dedicated test case verifying that `sourceHarness` is null when a memory has no source harness, and non-null when one is provided (via `SaveOptions.sourceHarness`).

## Acceptance criteria
- The `query_memory` tool response includes `createdAt`, `updatedAt`, and `sourceHarness` fields in the serialised JSON.
- Calling `query_memory` returns complete memory provenance information with no fields omitted from the underlying `Memory` type.
- All existing tests pass.
- New assertions in the query_memory test verify the presence and correctness of the three added fields.

## Changeset
```
patch
packages/mcp
Add missing provenance fields (createdAt, updatedAt, sourceHarness) to query_memory results
```

## Dependencies
None. This is a self-contained serialisation fix with no upstream requirements.

## Risk / notes
- **Non-breaking**: Adding new fields to the JSON response is safe for existing clients; they will simply ignore the additional properties.
- **Type safety**: The `Memory` type already carries these fields, so TypeScript will catch any future regressions if the serialisation logic is refactored.
- **Backwards compatibility**: Existing integrations relying on the partial shape will continue to work; new clients can opt into using the full provenance fields.
- **Database consistency**: These fields are already persisted and hydrated by the query layer, so no consistency risk.
