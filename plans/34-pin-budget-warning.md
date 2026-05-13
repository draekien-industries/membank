# Plan: #34 — Unbounded pin count is a context bloat risk

## Issue

`pin_memory` has no cap. On the verbatim injection path when background synthesis is disabled (the default) or absent/in-flight, pinned memories inject in full every session at full character count. This risks context bloat.

Comparable systems enforce ~2000-token always-on budgets. Membank lacks explicit synthesis infrastructure (addressed in #35), so today pinning is unbounded. This plan:

1. Adds a budget warning to `pin_memory` when projected total character count exceeds a threshold (default 8000 chars, approx 2000 tokens), but only when synthesis is disabled or config is absent.
2. Surfaces pin budget usage in `membank stats` to help users understand current bloat.
3. Documents config dependency: The synthesis-enabled check requires the config system introduced in #35.

## Verification

### Current state

1. **pin_memory handler** (packages/mcp/src/server.ts:345-356):
   - Parses PinMemoryArgsSchema (id only)
   - Calls core.repo.setPin(args.id, pinned) synchronously
   - Returns JSON-serialized memory object
   - No warning field in response currently

2. **setPin method** (packages/core/src/memory/repository.ts:338-359):
   - Finds memory by id, throws if not found
   - Updates memories.pinned to 1 or 0
   - Returns updated Memory object
   - No character counting, no budget awareness

3. **stats command** (packages/cli/src/commands/stats.ts):
   - Calls repo.stats() (returns { byType, total, needsReview })
   - Formatter outputs to stdout
   - No pin budget info currently

4. **Config infrastructure**:
   - No ~/.membank/config.json or synthesis.enabled flag exists today
   - Issue #35 will introduce it (soft dependency)
   - Strategy: When config does not exist, assume synthesis is disabled

## Design

### Pin budget threshold: 8000 characters

Default threshold is 8000 characters (safe approximation of ~2000 tokens at 4 chars/token).
Rationale: Matches "comparable systems" from issue; conservative; allows ~10-20 typical memories.
Not configurable in v1. Single pool: combines global + project-scoped budgets.

### Warning wording

When pin_memory is called AND synthesis is disabled:
- If total exceeds threshold: include pinBudgetWarning field in response
- Wording: "Pinned memory budget exceeded (N chars / 8000 threshold). Consider unpinning."
- If under threshold: no warning field

### Synthesis config check

- If ~/.membank/config.json exists with synthesis.enabled: true, suppress warning
- If config missing or synthesis.enabled: false, fire warning unconditionally
- Config missing case: treat as disabled (safe default)

### Stats output

repo.stats() returns { byType, total, needsReview, pinBudgetChars }
CLI formatter shows pin_budget line with char count and 8000 threshold

## Files to change

1. packages/core/src/config/loader.ts (NEW)
2. packages/core/src/config/index.ts (NEW)
3. packages/core/src/index.ts (UPDATE)
4. packages/core/src/memory/repository.ts (UPDATE)
5. packages/mcp/src/server.ts (UPDATE)
6. packages/cli/src/formatter.ts (UPDATE)

## Implementation

### packages/core/src/config/loader.ts

loadConfig(): Promise<Config | null>
- Reads ~/.membank/config.json if exists
- Parse schema: { synthesis: { enabled?: boolean } }
- Return null if file missing
- Throw on parse error

isSynthesisEnabled(): Promise<boolean>
- Calls loadConfig()
- Returns config?.synthesis?.enabled === true

### packages/core/src/memory/repository.ts

Add constant: PIN_BUDGET_THRESHOLD = 8000 (export it)

Add method getPinnedCharCount(): number
- Sum content.length of all pinned memories

Modify stats() method
- Call getPinnedCharCount()
- Return { byType, total, needsReview, pinBudgetChars }

### packages/mcp/src/server.ts

Import: { isSynthesisEnabled, PIN_BUDGET_THRESHOLD } from "@membank/core"

In pin_memory handler (after setPin call):
- If pinning: check synthesis state and budget
- If not enabled and budget exceeded: add pinBudgetWarning
- Return { memory, pinBudgetWarning? }
- If unpinning: just return { memory } (no warning)

### packages/cli/src/formatter.ts

Update StatsData: add pinBudgetChars: number

In outputStats():
- Human mode: add line showing pin_budget with char count / 8000
- JSON mode: included in JSON.stringify

## Acceptance criteria

- [ ] loadConfig() reads ~/.membank/config.json and returns Config or null
- [ ] isSynthesisEnabled() returns true only if config.synthesis.enabled === true
- [ ] MemoryRepository.getPinnedCharCount() sums pinned memory content lengths
- [ ] MemoryRepository.stats() includes pinBudgetChars field
- [ ] pin_memory returns warning when budget exceeded and synthesis disabled
- [ ] pin_memory returns no warning when budget under threshold
- [ ] pin_memory returns no warning when synthesis enabled
- [ ] pin_memory returns no warning when unpinning
- [ ] membank stats shows pin_budget line with char count / threshold
- [ ] Tests verify all cases

## Dependencies

Soft dependency on #35: Assumes ~/.membank/config.json with synthesis.enabled will exist.
- If #35 not shipped: config loader returns null, warnings fire unconditionally
- Once #35 ships: warnings automatically respect flag
- No code changes needed after #35 ships

Recommendation: Ship #34 and #35 together.

## Risks

1. Char count approximation: Conservative (may trigger early)
2. Config format: Assumes JSON; verify with #35
3. Performance: getPinnedCharCount() negligible for < 100 memories
4. Unpin behavior: Never warns (correct - reduces bloat)
5. Future: Adjust threshold based on synthesis budget once shipped
6. Backwards compat: stats() return shape changes; optional in JSON
