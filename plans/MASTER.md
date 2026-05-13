# Master Plan — Open Issues

Orchestration plan for resolving all 9 open GitHub issues in this repository. Each issue has a dedicated per-issue plan in this directory; this document describes the dependencies between them and the execution model Claude (or any orchestrator) should follow.

## Issue inventory

| # | Title | Type | Size | Plan |
|---|-------|------|------|------|
| 27 | `query_memory` results omit `createdAt`, `updatedAt`, `sourceHarness` | bug | XS | [27-query-memory-provenance.md](27-query-memory-provenance.md) |
| 28 | `QueryEngine` scoring ignores cosine similarity | bug | S | [28-cosine-scoring.md](28-cosine-scoring.md) |
| 29 | `query_memory` MCP tool has no scope parameter | enhancement | S | [29-query-scope-param.md](29-query-scope-param.md) |
| 30 | Add Stop hook for session-end memory capture | enhancement | M | [30-stop-hook.md](30-stop-hook.md) |
| 31 | Add `list_flagged_memories` and `resolve_review` MCP tools | enhancement | S | [31-flagged-mcp-tools.md](31-flagged-mcp-tools.md) |
| 32 | `update_memory` doesn't support type reclassification | enhancement | XS | [32-update-type-reclassification.md](32-update-type-reclassification.md) |
| 33 | Add `get_memory_summary` MCP tool | enhancement | XS | [33-get-memory-summary.md](33-get-memory-summary.md) |
| 34 | Unbounded pin count is a context bloat risk | enhancement (ux) | M | [34-pin-budget-warning.md](34-pin-budget-warning.md) |
| 35 | Background memory synthesis ("dreaming") engine | feature | XL | [35-synthesis-engine.md](35-synthesis-engine.md) |

## Dependency graph

```
                #27 provenance fields
                #28 cosine scoring          (improve retrieval quality — soft prereq for #35)
                          │
                          ▼
   ┌──────────────────────┴───────────────────────┐
   │                                              │
#29 scope param   #30 Stop hook   #31 flagged tools*   #32 type patch   #33 get_memory_summary*   #34 pin budget†
   │                                              │                              │
   └──────────────────────┬───────────────────────┘                              │
                          ▼                                                      │
                       #35 synthesis engine ◄────────────────────────────────────┘

* hard prerequisites for #35
† soft interaction with #35 (shares the `synthesis.enabled` config flag — the plan tolerates config absence)
```

### Hard dependencies (must merge before dependent)
- **#33 → #35**: Synthesis agent calls `get_memory_summary` first to orient before querying.
- **#31 → #35**: Synthesis agent calls `resolve_review` / consults flagged queue for contradictions.

### Soft dependencies (recommended order, not blocking)
- **#27, #28 → #35**: Quality of synthesis output depends on quality of retrieval. Provenance fields (#27) help the synthesis agent reason about freshness; correct cosine ranking (#28) prevents irrelevant memories dominating context.
- **#34 ↔ #35**: Both touch the `synthesis.enabled` config flag. #34's plan tolerates absent config (warnings fire unconditionally — the safe default), so either order works.

### Independent
- #29, #30, #32 have no dependencies on any other issue.

## Execution model

The repo already has a documented worktree workflow (see `CLAUDE.md` → "Subagent worktree cleanup") and a mandatory changeset policy. The orchestration model below extends those.

### Wave 1 — foundations (parallel)

Run these first because they are bug fixes that improve retrieval quality before the synthesis feature is built on top.

- #27 — provenance fields
- #28 — cosine scoring

**Dispatch**: 2 subagents, each in its own `isolation: "worktree"`. Both touch different code paths (server.ts serialization vs. query engine scoring) — low conflict risk.

**Gate**: both PRs merged to `main` before Wave 2 begins (or at least #28 merged; #27 is independent enough to overlap).

### Wave 2 — independent MCP/CLI work (parallel)

Six issues with no interdependencies among themselves.

- #29 — query_memory scope parameter
- #30 — Stop hook
- #31 — flagged review MCP tools  *(unblocks #35)*
- #32 — type reclassification
- #33 — get_memory_summary MCP tool  *(unblocks #35)*
- #34 — pin budget warning  *(soft-interacts with #35)*

**Dispatch**: 6 subagents in parallel, each in its own worktree.

**Conflict risk**: #29, #31, #33, #34 all edit `packages/mcp/src/server.ts` (tool registry + handlers). Merge order matters; the second-and-subsequent PRs will likely need a rebase. Strategy:
- Merge in order of smallest diff first (#33 → #31 → #29 → #34) so each subsequent PR rebases against a smaller delta.
- Alternatively, serialize the four `server.ts` PRs while running #30 and #32 truly in parallel.

**Gate**: #31 and #33 must be merged before Wave 3 starts (hard prereqs of #35). Other Wave 2 work may continue in parallel with Wave 3.

### Wave 3 — synthesis engine (single worktree)

- #35 — synthesis engine

**Dispatch**: 1 subagent in a single long-lived worktree. The plan ([35-synthesis-engine.md](35-synthesis-engine.md)) is structured in 6 phases; the orchestrator may further split this into multiple commits/PRs within the same worktree branch, or split across sub-worktrees per phase if review burden becomes too high.

**Gate**: requires #31, #33 merged. Recommended that #27, #28 are also merged (synthesis quality).

## Per-worktree rules (apply uniformly)

Every worktree, regardless of wave, must:

1. **Read the per-issue plan first** — do not re-investigate; the plan already verified the relevant files and line numbers.
2. **Make the code changes** described in the plan's "Implementation steps".
3. **Add the tests** described in the plan's "Tests" section.
4. **Run quality gates** before declaring done:
   - `pnpm --filter <touched-package> typecheck`
   - `pnpm --filter <touched-package> test`
   - `pnpm lint`
   - For UI/CLI changes: smoke-test the user-facing surface manually if test coverage doesn't fully exercise it.
5. **Run `/simplify`** per the CLAUDE.md implementation checklist.
6. **Create the changeset** — `pnpm changeset` from inside the worktree. Bump type and one-sentence description are specified in each per-issue plan's "Changeset" section. The `.changeset/*.md` file MUST be committed on the branch before merge.
7. **Commit** using conventional commit format (e.g., `fix(core): include cosine similarity in query score`).
8. **Open PR** and merge once CI passes.
9. **Clean up the worktree** per the CLAUDE.md "Subagent worktree cleanup" section after merge.

## Orchestrator playbook

When Claude (or a future operator) is asked to "execute the master plan", follow this sequence:

```text
1. Refresh issue state:
   gh issue list --state open --json number,title --limit 100
   Drop any plans for issues that have been closed.

2. Wave 1: dispatch 2 worktree subagents in parallel
   - Each receives: path to its per-issue plan + the per-worktree rules above
   - Wait for both to complete + PRs to merge

3. Wave 2: dispatch up to 6 worktree subagents
   - Stagger server.ts-touching PRs (see "Conflict risk" above) OR serialize them
   - #30 and #32 can run fully in parallel without conflict
   - Wait for #31 and #33 to merge before unblocking Wave 3

4. Wave 3: dispatch 1 worktree subagent for #35
   - This is large — may be sub-divided into phases per the plan
   - Coordinate with any still-in-flight Wave 2 work (e.g. #34 may finish during Wave 3)

5. After all merges:
   - Verify changesets are present in `.changeset/*.md`
   - Let the release pipeline (per CLAUDE.md "Release cycle") produce the version PR and rc snapshot
```

## Notes & ambiguities surfaced during planning

- **#31 — `flag_for_review` naming**: Issue #35's body lists a `flag_for_review` tool as a synthesis-agent prerequisite. The #31 plan determined this is a misnaming — flagging already happens automatically during dedup, so #31 exposes `list_flagged_memories` + `resolve_review` only. If #35 implementation actually needs a non-destructive flag-creation tool, scope that addition into #35 itself rather than reopening #31.
- **#29 — behavioral change**: Adding scope defaults to `query_memory` is technically a behavioral change for existing callers who currently get cross-project results. The plan documents this; consider whether to call it out in the changeset description (likely minor bump is appropriate).
- **#34 + #35 config infrastructure**: Both introduce or rely on `~/.membank/config.json`. If #34 ships first, it gets the config loader; #35 reuses it. If #35 ships first, #34 reuses #35's loader. The plans are written to be order-independent.
- **#30 — opencode session-end**: The #30 plan documents opencode as having no session-end equivalent today. Implementation should degrade gracefully (warn at setup, do not error).
