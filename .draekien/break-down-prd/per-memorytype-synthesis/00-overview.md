# Per-MemoryType Synthesis & Verbatim Pinned Section — Tracer-Bullet Breakdown

**Source PRD:** GitHub issue #93 (drafted in current session)

## Bullets (in execution order)

Bullets run in sequence; each is demoable on completion.

1. [Bullet 01 — Per-MemoryType synthesis end-to-end](01-per-type-synthesis.md) — re-key synthesis storage by (scope, MemoryType), generate one synthesis per non-empty type excluding pinned, and assemble a single SessionContext with a verbatim pinned section + ordered per-type syntheses.
2. [Bullet 02 — Threshold-gated verbatim fallback](02-threshold-fallback.md) — small MemoryType groups (below a configurable word-count SynthesisThreshold, default 150) inject verbatim instead of being summarized.
3. [Bullet 03 — Legacy synthesis invalidation on upgrade](03-legacy-invalidation.md) — pre-existing single-blob syntheses are invalidated, never injected again, and regenerate in per-type form.

## Task summary

- **AFK:** 17
- **HIL:** 1
- **Total:** 18

## Coverage check

Every PRD user story and measurable goal maps to at least one task. Any item marked UNCOVERED is a gap to resolve, not to ship.

| PRD item | Covered by |
|----------|------------|
| US-1: each kind of memory summarized separately | B01/T2, B01/T3 |
| US-2: pinned memories shown word-for-word | B01/T2, B01/T4 |
| US-3: few memories of a kind shown verbatim | B02/T2, B02/T4 |
| US-4: predictable, ordered structure | B01/T4, B01/T6 |
| US-5: stale combined syntheses replaced automatically | B03/T1, B03/T3 |
| G-1: ≤1 Synthesis per MemoryType (max 5/scope), not one blob | B01/T1, B01/T3 |
| G-2: no pinned content in any Synthesis; pinned verbatim in 100% of injections | B01/T2, B01/T4 |
| G-3: below-threshold verbatim / at-or-above synthesized; default 150 words, configurable; deterministic | B02/T1, B02/T2, B02/T3, B02/T4, B02/T5 |
| G-4: every injection contains pinned + per-type together; mode switch removed | B01/T4, B01/T5 |
| G-5: fixed order — pinned first, then MemoryType precedence | B01/T4, B01/T6 |
| G-6: upgrade invalidates legacy blobs; regenerate per-type | B03/T1, B03/T2, B03/T3 |

No UNCOVERED items.

## Risks (attacked first)

- **Storage re-keying from `scope` to `(scope, MemoryType)`** — the synthesis table, its versioning, in-flight tracking, and dirty/expiry detection are all keyed by `scope` today. This is the structural change most likely to be wrong — addressed in Bullet 01 by T1 and T3.
- **Collapsing the `SessionContext` discriminated union** (`synthesis` | `pinned`) into one always-both shape breaks every consumer that renders it — addressed in Bullet 01 by T4 and T5.
- **Subjective readability of the new multi-section injection** — the only irreducibly human judgment in the feature — addressed in Bullet 01 by T6 (HIL).
- **Upgrade with legacy single-blob data present** — old rows must never leak into injection after upgrade — addressed in Bullet 03 by T1 and T3.
