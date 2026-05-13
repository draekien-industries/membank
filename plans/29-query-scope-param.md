# Plan: #29 — query_memory MCP tool scope parameter

## Issue

The `query_memory` MCP tool in `packages/mcp/src/server.ts` has no scope parameter in its input schema, so all queries are cross-project (global). The underlying `QueryEngine.query()` accepts `projectHash` in `QueryOptions` to filter by project, but the MCP tool never passes it. This is asymmetric with `save_memory`, which correctly respects project scope via the `global` parameter and `resolveProject()`. Users cannot query memories scoped to their current project.

## Verification

1. **query_memory tool definition** (server.ts:134-155): Input schema has `query`, `type`, `limit`, `includePinned` only. No scope parameter.

2. **query_memory handler** (server.ts:276-305): Calls `core.query.query()` with options that never include `projectHash` (lines 280-285). Always queries cross-project.

3. **save_memory handler** (server.ts:214-233): Lines 216-223 show the pattern:
   - Parses `args.global` (boolean, optional)
   - If `args.global !== true`, calls `await resolveProject()` to get `{ hash, name }`
   - Passes `projectScope` to `core.repo.save()`
   - When `projectScope === undefined`, searches/saves globally; otherwise scoped by hash

4. **resolveProject() signature** (scope/resolver.ts:11-33):
   - Returns `Promise<{ hash: string; name: string }>`
   - Uses git origin URL hash, falls back to cwd hash
   - Exported from `@membank/core` (index.ts)

5. **QueryEngine.query()** (query/engine.ts:31-93):
   - Accepts `QueryOptions` with optional `projectHash`
   - Line 56: When `projectHash !== undefined`, joins `memory_projects` and `projects` tables, filters `WHERE p.scope_hash = ?`
   - When `projectHash === undefined`, returns all memories across all projects (no join, no project filter)

6. **QueryOptions schema** (core/schemas.ts:67-74):
   - Has optional `projectHash: string`
   - Used by both `QueryEngine.query()` and (via validation) callers

7. **SaveOptions schema** (core/schemas.ts:76-83):
   - Has optional `projectScope: { hash: string; name: string }`
   - When undefined, dedup/save is global; when set, dedup is scoped to that project (memory/repository.ts:58-79)

8. **Deduplication mirrors scope** (memory/repository.ts:56-79):
   - When `projectScope !== undefined`: dedup searches only within that project's memories (lines 58-68)
   - When `projectScope === undefined`: dedup searches only global memories (lines 69-78, `NOT IN (SELECT memory_id FROM memory_projects)`)
   - This ensures save and query semantics are aligned

## Files to change

- `packages/mcp/src/schemas.ts:21-26` — Add `global: z.boolean().optional()` to `QueryMemoryArgsSchema`
- `packages/mcp/src/server.ts:137-155` — Add `global` property to `query_memory` input schema definition
- `packages/mcp/src/server.ts:276-305` — Update `query_memory` handler:
  - Parse `args.global` from arguments
  - Resolve project if `args.global !== true`
  - Pass `projectHash` to `core.query.query()`

## Implementation steps

1. **Update schema** (schemas.ts):
   - Add `global: z.boolean().optional()` to `QueryMemoryArgsSchema`

2. **Update tool definition** (server.ts:134-155):
   - Add `global` property to inputSchema object:
     ```
     global: {
       type: "boolean",
       description: "Query global memories only. When omitted or false, queries the current project scope.",
     }
     ```

3. **Update query_memory handler** (server.ts:276-305):
   - After parsing args (line 277), add:
     ```
     const projectScope = args.global === true ? undefined : await resolveProject();
     const projectHash = projectScope?.hash;
     ```
   - Pass `projectHash` to `core.query.query()` call (line 280):
     ```
     const results = await core.query.query({
       query: args.query,
       type: args.type,
       projectHash,
       limit: args.limit ?? 10,
       includePinned: args.includePinned,
     });
     ```

## Semantic decisions

- **Default behavior (global omitted or false)**: Query scoped to current project (`resolveProject()` hash). Matches save_memory default.
- **global: true**: Query globally across all projects. Returns memories not tied to any project + all project-scoped memories (because QueryEngine adds no WHERE clause when projectHash is undefined).
- **Project queries do NOT include global memories**: When `projectHash` is set, the SQL joins `memory_projects` and filters by `scope_hash`, so it only returns memories explicitly tied to that project. Global (non-project) memories are excluded. This is intentional — aligns with save_memory dedup logic, which deduplicates separately for project vs. global contexts.
- **includePinned semantics unchanged**: Already works as intended; pinned memories can be project-scoped or global based on their associations.

## Tests

1. **Cross-project isolation**: Save memory in project A (with project scope), save in project B (with project scope), query from project A (default)—should only see A's memories.
2. **Global query works**: Query with `global: true`—should see all memories regardless of project association.
3. **Default behavior matches save**: After saving with default (project-scoped), querying with default should find it.
4. **Backwards compatibility warning**: Existing code calling query_memory without the new parameter will now be scoped to their project, which changes behavior (was cross-project before).

## Acceptance criteria

- [ ] QueryMemoryArgsSchema accepts optional `global: boolean`
- [ ] query_memory tool input schema includes `global` parameter
- [ ] query_memory handler resolves project when `global` is not true
- [ ] projectHash is passed to QueryEngine.query()
- [ ] Tests verify project-scoped queries return only project memories
- [ ] Tests verify global: true returns all memories
- [ ] Documentation updated: query_memory now respects project scope (breaking change)

## Changeset

```
minor @membank/mcp — Add optional `global` parameter to query_memory tool to scope queries by project.
```

## Dependencies

None. All required APIs (resolveProject, QueryOptions.projectHash) already exist.

## Risk / notes

**Breaking change**: Existing callers relying on cross-project results from query_memory will now be scoped to their current project by default. This is the intended fix, but calling code may need updates.

**Rationale for symmetric defaults**: Both save_memory and query_memory now default to project scope, ensuring users see consistency between what they save and what they query in their own project context. Global scope requires explicit opt-in (`global: true`), protecting against accidental cross-project pollution.

**SQL filter semantics**: Project-scoped queries use `LEFT JOIN memory_projects ... memory_projects.memory_id`, which naturally excludes unassociated (global) memories. This is correct — global and project-scoped memories are logically separate stores (as enforced by deduplication logic in MemoryRepository).
