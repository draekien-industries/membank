# Plan: #28 — QueryEngine scoring ignores cosine similarity

## Issue

The `QueryEngine` computes `cosine_sim` for each memory row via SQL (`1 - vec_distance_cosine(e.embedding, ?)`) but the scoring function `#computeScore` discards it—using it only as a filter (`cosine_sim > 0`). This means semantically similar memories rank the same as dissimilar ones; type weight dominates disproportionately.

**Current formula** (ignores cosine_sim):
```
score = typeWeight × 0.4 + accessCountNorm × 0.3 + recencyNorm × 0.2 + pinned × 0.1
```

**Proposed rebalance** (incorporates cosine_sim):
```
score = cosine_sim × 0.4 + typeWeight × 0.25 + accessCountNorm × 0.2 + recencyNorm × 0.1 + pinned × 0.05
```

## Verification

- **SQL produces `cosine_sim`**: `packages/core/src/query/engine.ts:66` — `SELECT m.*, (1 - vec_distance_cosine(e.embedding, ?)) AS cosine_sim`
- **`QueryMemoryRow` extends `MemoryRow`**: `packages/core/src/query/engine.ts:8-10` — interface adds `cosine_sim: number`
- **Cosine_sim is filtered but not scored**: `packages/core/src/query/engine.ts:77` — `.filter((row) => row.cosine_sim > 0)` includes cosine_sim, but `#computeScore` at line 80 receives only `Memory` object (cosine_sim is lost in conversion via `rowToMemory` at line 79)
- **`#computeScore` ignores cosine_sim**: `packages/core/src/query/engine.ts:95-103` — current formula uses only `typeWeight`, `accessCountNorm`, `recencyNorm`, `pinned`
- **Test confirms failure case**: `packages/core/src/query/engine.test.ts:91-114` — test "returns results ordered by score DESC (correction beats fact via type weight)" shows correction (weight 1.0) ranks above fact (weight 0.2) even at identical cosine_sim = 1.0. This test will fail after rebalancing when a higher cosine_sim should outweigh type weight differences.

## Files to change

- **`packages/core/src/query/engine.ts:8-10`** — Extend `QueryMemoryRow` interface to thread `cosine_sim` through (already done; no change needed)
- **`packages/core/src/query/engine.ts:31-93`** — Modify `query()` method to pass `cosine_sim` to `#computeScore`
  - At line 79, pass `row.cosine_sim` alongside `memory` to `#computeScore`
  - Signature change: `#computeScore(memory: Memory, cosine_sim: number, now: number): number`
- **`packages/core/src/query/engine.ts:95-103`** — Rewrite `#computeScore` to apply new weighting formula with cosine_sim at 0.4 weight
- **`packages/core/src/query/engine.test.ts`** — Update/add tests to verify cosine_sim influences ranking and new weights apply correctly

## Implementation steps

1. **Signature update**: Change `#computeScore` to accept `cosine_sim: number` as second parameter
   - Current: `#computeScore(memory: Memory, now: number): number`
   - New: `#computeScore(memory: Memory, cosine_sim: number, now: number): number`

2. **Thread cosine_sim from SQL to scorer**:
   - At `query()` line 78-81, change the `.map()` call:
     ```typescript
     .map((row) => {
       const memory = rowToMemory(row, []);
       const score = this.#computeScore(memory, row.cosine_sim, now);
       return { ...memory, score };
     });
     ```

3. **Rebalance weights in `#computeScore`**:
   - Replace lines 95-103 with new formula:
     ```typescript
     #computeScore(memory: Memory, cosine_sim: number, now: number): number {
       const typeWeight = TYPE_WEIGHTS[memory.type];
       const accessCountNorm = memory.accessCount / (memory.accessCount + 10);
       const daysSinceUpdate = (now - new Date(memory.updatedAt).getTime()) / 86400000;
       const recencyNorm = 1 / (1 + daysSinceUpdate);
       const pinned = memory.pinned ? 1.0 : 0.0;
     
       return cosine_sim * 0.4 + typeWeight * 0.25 + accessCountNorm * 0.2 + recencyNorm * 0.1 + pinned * 0.05;
     }
     ```
   - Cosine_sim is already in [0, 1] after filter (line 77 excludes ≤ 0); no additional normalization needed.

4. **Normalize cosine_sim if needed** (likely not, but verify):
   - The filter at line 77 (`cosine_sim > 0`) removes orthogonal/negative matches.
   - In practice, `vec_distance_cosine` returns [0, 2], so `1 - distance` yields [-1, 1].
   - Filter keeps only `(0, 1]`; no rescaling required.

## Tests

### Failing test to fix
- **`engine.test.ts:91-114` — "returns results ordered by score DESC (correction beats fact via type weight)"**
  - Current expectation: correction (typeWeight 1.0 × 0.4 = 0.4) ranks above fact (typeWeight 0.2 × 0.4 = 0.08)
  - After fix: Both have cosine_sim = 1.0 (identical embeddings), so:
    - correction: 1.0 × 0.4 + 1.0 × 0.25 = 0.65
    - fact: 1.0 × 0.4 + 0.2 × 0.25 = 0.45
    - ✓ Correction still ranks above fact (0.65 > 0.45), test passes
  - **Conclusion**: Test passes after fix due to cosine_sim dominance (0.4 weight). Update test comment to reflect new dominance.

### New test: cosine_sim outweighs type weight
- Create test case with:
  - Memory A: type `fact` (0.2), high cosine_sim (e.g., 0.9)
  - Memory B: type `correction` (1.0), low cosine_sim (e.g., 0.1)
  - Expect Memory A to rank above Memory B
  - Scores: A = 0.9 × 0.4 + 0.2 × 0.25 = 0.41, B = 0.1 × 0.4 + 1.0 × 0.25 = 0.29
  - ✓ A > B

### Existing tests that should remain passing
- `engine.test.ts:222-246` — "correction ranks above preference at identical cosine similarity" — passes (both cosine_sim = 1.0, correction weight > preference weight)
- `engine.test.ts:272-296` — "pinned memory ranks above unpinned at identical similarity" — passes (cosine_sim same, pinned adds 0.05 weight)
- `engine.test.ts:298-313` — "filters out memories with cosine_sim <= 0" — still passes (filter unchanged)
- All other tests unaffected (no cosine_sim variance in their data)

## Acceptance criteria

- [ ] `#computeScore` receives and uses `cosine_sim` parameter
- [ ] Scoring formula applies new weights: 0.4 (cosine_sim), 0.25 (type), 0.2 (accessCount), 0.1 (recency), 0.05 (pinned)
- [ ] Test case exists verifying high cosine_sim beats lower type weight (fact 0.9 > correction 0.1)
- [ ] Test case "correction beats fact at identical cosine similarity" still passes
- [ ] No test regressions in engine.test.ts

## Changeset

**@membank/core (patch)**: Integrated cosine similarity into memory scoring formula to prioritize semantic relevance over type weight, rebalancing from `typeWeight × 0.4` to `cosine_sim × 0.4 + typeWeight × 0.25`.

## Dependencies

- None. This is a standalone scoring improvement.
- Related: Issue #35 (synthesis agent) recommends this fix completes first for higher-quality synthesis results.

## Risk / notes

- **Score distribution changes**: Memories will re-rank; high cosine_sim now dominates. Tests with implicit ranking expectations may fail.
- **No API impact**: `query()` return signature unchanged (still `Array<Memory & { score: number }>`).
- **Normalization**: Cosine_sim is already [0, 1] after filter; no rescaling needed.
- **Type weights preserved**: Relative weighting of `correction` > `preference` > `decision` > `learning` > `fact` maintained but at lower overall influence (0.25 vs. 0.4).
