# Memory Quality — Implementation Plan

Derived from [`memory-quality-criteria.md`](./memory-quality-criteria.md), grounded in the current
codebase. Four sequential phases, each independently shippable with its own changeset.
`pnpm build && pnpm typecheck && pnpm lint` gates every phase.

Phases 1 and 2 are self-contained. Phase 4 depends on Phase 3 (`durability` feeds the idle penalty).

## Locked decisions

| Decision | Resolution |
|---|---|
| Auto-memory handling | Setup prompt **and** a `membank doctor` command |
| `setup --yes` | Detects and reports the conflict; never writes the setting |
| Rejected candidates | Persisted to a new table, so the gate is tunable against real data |
| Retention | Surfaces low-value memories in dashboard triage; never auto-deletes |

## Codebase-grounded notes

- Latest migration is **16** (`core/src/db/manager.ts`). Phase 3 adds `[17, sql]`, Phase 4 adds `[18, sql]`.
- `scope/resolver.ts:41` is the split-scope cause: remote URL hash when `git remote get-url origin`
  succeeds, main-worktree-root hash otherwise. Gaining an origin flips the hash.
- `project/application/merge-projects.ts` already exists — Phase 1 consumes it, does not rewrite it.
- `extract.ts:84` already sources `transcript_path` from the hook payload. The ENOENT is a genuinely
  absent file, not a path-construction bug.
- Native auto-memory is controlled by top-level `autoMemoryEnabled: boolean` in
  `~/.claude/settings.json`, or `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`. Prefer the settings key —
  the env var only applies where it happens to be exported.
- `PromptHelper` (`cli/src/prompt-helper.ts`) returns `true` unconditionally when `autoConfirm` is
  set. The auto-memory gate must therefore **not** route through it; see Phase 1.3.

---

## Phase 1 — Pipeline health

No schema change. Restores the extraction success rate and stops the two silent data-integrity
failures. Highest value per unit of risk; ship first.

### 1.1 Absent transcript is a skip, not a failure

`core/src/extraction/application/run-extraction.ts`

- Before claiming the run, stat the transcript. Absent → return `{ status: "skipped", reason: "transcript_unavailable" }` without writing a `failed` row.
- One bounded retry after ~2s before concluding absence. If the flush-race hypothesis holds this
  recovers the run outright; if not it costs 2s on a path that was already failing.
- Wrap `reader.read()` so a mid-read `ENOENT` takes the same skip path.

Reclassifies ~181 historical-equivalent failures. Tests: absent throughout → skipped, no row;
absent then present → completed; present → unchanged.

### 1.2 Reap stuck `in_flight` runs

`core/src/extraction/domain/extraction-policy.ts` + the sqlite repository.

- Add `reapStale(now, timeoutMs)` to the repository: `in_flight` rows with
  `started_at < now - timeoutMs` become `failed` with error `reaped: exceeded in-flight timeout`.
- Call it once at the start of `runExtraction`, before `decideClaim`.

`decideClaim` itself is correct and stays untouched — its blind spot is only that nothing retries a
dead session id. Domain test on the boundary condition; integration test against real sqlite.

### 1.3 Native auto-memory gate in `setup`

`cli/src/setup/` — new `claude-settings-reader.ts` (read/patch `~/.claude/settings.json`,
preserving key order and unknown keys) and wiring in `setup-orchestrator.ts`.

- Detect: claude-code among detected harnesses **and** `autoMemoryEnabled !== false`.
- Interactive: explain the conflict — native auto-memory writes to
  `~/.claude/projects/<project>/memory/` under system-prompt instructions that outrank membank's
  MCP tool — then offer to set `autoMemoryEnabled: false`. Default No.
- `--yes` / `--json`: report only. Do not write. This is deliberate and must be asserted by a test:
  the gate takes its own `Prompter` directly rather than `PromptHelper`, because `PromptHelper`
  returns `true` unconditionally under `autoConfirm` and would silently disable the feature.
- Persist a `setup.autoMemoryPromptDismissed` config flag so declining is not re-asked every run.
- Add `autoMemoryConflict: "none" | "reported" | "disabled"` to `SetupJsonOutput`.

### 1.4 `membank doctor`

`cli/src/commands/doctor.ts`. Read-only by default; `--fix` applies. Checks:

| Check | Detection | Fix |
|---|---|---|
| Native auto-memory active | `autoMemoryEnabled !== false` | Set `false` (prompted) |
| Stuck `in_flight` runs | Rows past timeout | Reap |
| Split project scope | Two projects, same basename, one origin a filesystem path and the other a git URL | `mergeProjects` (prompted per pair) |
| Extraction failure rate | Failed ÷ total over trailing 30 days | None — report only |

Split-scope detection stays a *heuristic that proposes*, never one that acts unprompted: two
unrelated repos can share a basename, and merging is not cleanly reversible.

`--json` for scripting. This is the only thing that helps installs that already exist, which is why
it ships in Phase 1 rather than later.

### 1.5 Stop the split recurring

`core/src/scope/resolver.ts`

`resolveProject()` gains a resolution step: when a remote exists, before returning the remote hash,
check whether a project already exists under the main-worktree-root hash. If so, surface it as an
adoption candidate rather than forking.

The resolver is currently pure path/git logic with no DB access, and it is used on hot paths. Do
**not** give it a repository dependency. Instead return both the primary hash and a
`priorHash?: string`, and let the calling application layer decide whether to adopt. Keeps the
dependency direction intact and the resolver testable without sqlite.

### 1.6 One-off data repair

Not code. Run `doctor --fix` against the live DB to merge the three pairs (`dia` 50+92,
`crucible` 3+50, `mashay` 6+3) and reap the 31 stuck rows. Verify 59 memories moved and no
`memory_projects` row is orphaned.

---

## Phase 2 — Dedup threshold

Smallest phase. Ship separately so its effect on the review queue is observable in isolation.

1. `memory/domain/dedup-policy.ts`: `FLAG_THRESHOLD` 0.75 → **0.85**. `AUTO_OVERWRITE_THRESHOLD`
   unchanged at 0.92 — the 0.88–0.90 band contains genuine merge candidates that should stay
   human-reviewed, not auto-overwritten.
2. Update `classifyDuplicate` tests for the new boundary.
3. One-off: bulk-resolve the 33 open review events below 0.85 as dismissed. `resolve-review-many.ts`
   already supports this; no new code. Leaves a queue of ~34 real candidates.
4. Changeset: `@membank/core` minor.

The 0.85 constant is a judgment call from reading 67 pairs, not a tuned value. Phase 3's rejection
log is what will eventually let it be tuned from data.

---

## Phase 3 — Admission gate

The substantial phase. Moves admission policy out of the system prompt and into testable domain code.

### 3.1 Migration 17

```sql
CREATE TABLE rejected_candidates (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  type TEXT NOT NULL,
  durability TEXT NOT NULL,
  derivability TEXT NOT NULL,
  actionability TEXT NOT NULL,
  evidence_quote TEXT NOT NULL,
  rejected_clause TEXT NOT NULL,
  session_id TEXT NOT NULL,
  project_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_rejected_created ON rejected_candidates(created_at);
```

Additive. Nothing is altered on `memories`. The rubric fields are recorded on **rejections only** —
admitted memories do not carry them, because nothing in Phase 3 reads them back. Phase 4 adds
`durability` to `memories` when the idle penalty actually needs it. Storing it earlier would be
speculative.

Rejections are pruned at 30 days by the same reaper pass as 1.2 — a diagnostic log, not an archive.

### 3.2 Domain: the gate

`core/src/extraction/domain/admission-policy.ts` — pure, no imports beyond sibling domain types.

```ts
type Durability = "permanent" | "stable" | "volatile";
type Derivability = "hidden" | "costly" | "trivial";
type Actionability = "directive" | "constraint" | "context";

type AdmissionDecision =
  | { kind: "admit" }
  | { kind: "reject"; clause: "volatile" | "trivially-derivable" | "inert" | "ungrounded" };

function decideAdmission(candidate: MemoryCandidate): AdmissionDecision;
```

A discriminated union, per `.claude/rules/discriminated-unions.md`. Clause order is fixed so the
reported reason is deterministic: `ungrounded` → `volatile` → `trivially-derivable` → `inert`.

Test the full 3×3×3 combination space plus empty-evidence — 82 cases, exhaustive and cheap.
Additionally assert the six worked examples from the criteria doc land on their stated verdicts;
that table is the gate's acceptance criteria.

### 3.3 Agent contract

`core/src/extraction/infrastructure/claude-agent-runner.ts`

- `save_memory` gains `durability`, `derivability`, `actionability`, `evidence` as **required** Zod
  params. Required, not optional: the agent must commit to a classification that can be evaluated
  against outcomes.
- The system prompt's `DO NOT save` prose collapses into a definition of the three axes plus
  worked examples. The prompt teaches classification; the gate makes the decision. Prose that
  duplicates a gate clause gets deleted — two sources of truth for one rule is how the current
  version drifted.
- The tool callback runs `decideAdmission` before `tools.saveMemory`. On reject: persist to
  `rejected_candidates`, return the clause to the agent as the tool result so it stops re-proposing.

### 3.4 Advisory smells

`core/src/extraction/domain/content-smells.ts` — the regexes from the audit (file paths, past-tense
completed actions, session deixis). These **never reject**. They are recorded alongside rejections
and surfaced in `doctor`, so a divergence between what the agent self-reports as `hidden` and what
looks trivially derivable becomes visible. A hard regex reject would kill the Postgres GUC learning
for containing a symbol name.

### 3.5 Presentation

- MCP `save_memory`: rubric fields **optional**. A human calling the tool directly is not subject to
  the extraction gate — the gate exists to filter an automated proposer, and applying it to
  deliberate human saves would be surprising (POLA).
- `membank doctor` gains a rejection summary: counts by clause over 30 days.

Changeset: `@membank/core` minor, `@membank/mcp` minor.

---

## Phase 4 — Retention

Depends on Phase 3.

1. **Migration 18** — `memories.durability TEXT NULL`. Null for all 705 existing rows, which is
   correct: they were never classified, and backfilling by LLM would fabricate a signal.
2. `memory/domain/retention.ts` — `computeRetention(memory, signals, now)`, separate from
   `query/domain/scoring.ts`. Retrieval ranking answers "which of these matches the query";
   retention answers "should this exist at all". Same shape, different question, no shared function.
   `idlePenalty` is zero for `permanent`, ramps for `stable`, and uses the `stable` ramp for null.
3. `corroboration_count` on `memories`, incremented when dedup finds a ≥0.92 match instead of
   silently overwriting. Re-affirmation is currently discarded, and it is the strongest available
   evidence that a memory earns its place.
4. Dashboard triage: a low-retention lane. Bulk select → delete, explicitly user-initiated.
5. One-off backlog pass over the 490 never-retrieved, reviewed through the triage UI. **Not**
   scripted — a `--prune` that deletes hundreds of user-authored memories on a heuristic is exactly
   the unrecoverable action the surface-only decision was made to avoid.

Changeset: `@membank/core` minor, `@membank/dashboard` minor.

---

## Sequencing

```
Phase 1  ──────────────►  Phase 2  ──────────────►  Phase 3  ──────────────►  Phase 4
health, no schema         one constant              migration 17, gate        migration 18, decay
independently shippable   independent               depends on nothing        depends on Phase 3
```

Phase 1 is worth landing on its own even if the rest slips: it fixes a 39% extraction failure rate,
59 stranded memories, and a silent capture conflict, none of which need the rubric to be worth fixing.
