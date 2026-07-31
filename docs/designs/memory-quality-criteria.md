# Memory Quality Criteria

## Name and Purpose

A machine-evaluable rubric for deciding whether a candidate memory is worth storing, and for
ranking, reviewing, and retiring memories already stored. It replaces prose guidance embedded in
the extraction system prompt with structured attributes the application can read, test, and act on.

## Motivating audit (2026-07-31, 705 memories / 17 projects)

| Signal | Value | Reading |
|---|---|---|
| Never retrieved (`access_count = 0`) | 490 / 705 (70%) | Admission is far looser than retrieval demand |
| Never retrieved, by type | learning 217/279, decision 145/201, fact 51/65, preference 70/124, correction 7/36 | `correction` and `preference` earn their place; `decision` and `learning` are the bloat |
| Contain a file path or symbol reference | 104 (15%) | Code-derivable content is being stored as memory |
| Past-tense completed-action phrasing | 44 (6%) | The prompt's "do not save completed actions" rule leaks |
| Extraction runs failed | 182 / 467 (39%) | 181 are `ENOENT` on the transcript file |
| Extraction runs stuck `in_flight` | 31 | Never reclaimed — `decideClaim` only reclaims on a retry of the same session id |
| Open dedup review pairs | 67, oldest 2026-06-15, none resolved since 2026-06-19 | The queue is abandoned |
| Open pairs in the 0.75–0.80 band | 33 / 67 | Manual inspection: topically adjacent, not duplicates — false positives |
| Split-scope projects | `dia` (50 local + 92 remote), `crucible` (3 + 50), `mashay` (6 + 3) | 59 memories stranded in a shadow scope |

Two conclusions drive the rubric:

1. **The gate is in the wrong place.** Admission policy lives in the extraction system prompt, so it
   is untestable, non-uniform across the five entry points (extraction agent, MCP `save_memory`, CLI,
   dashboard, synthesis), and silently degrades. It belongs in `extraction/domain/` as a pure function.
2. **The dominant failure is derivability, not durability.** The prompt asks "will this still be true
   in weeks?" Most rejected-in-hindsight memories pass that test — `Biome 2.x is the linter for
   membank` is still true. They fail a different test: a future session learns it in one glance at
   `biome.json`. Durability alone cannot filter them out.

## Key Data Structures

```
// Assigned by the extraction agent per candidate — cheap, single-token classifications.
Durability   = "permanent"      // true independent of the codebase's current state
             | "stable"         // true until a deliberate decision changes it
             | "volatile"       // tied to the current task, PR, or branch

Derivability = "hidden"         // a future session cannot learn this from repo contents at all
             | "costly"         // discoverable, but only by debugging or reading external sources
             | "trivial"        // one file read or one grep away

Actionability = "directive"     // changes what a future session DOES ("use pnpm, never npm")
              | "constraint"    // bounds what it MAY do ("never run electron-builder locally")
              | "context"       // describes state without implying an action

Evidence = { quote: string, turnIndex: number }   // verbatim span from the transcript

MemoryCandidate {
  content, type, target, tags,
  durability, derivability, actionability,
  evidence: Evidence
}

// Computed by the system, never by the agent.
RetentionSignals {
  accessCount, corroborationCount,   // times re-affirmed by a later extraction
  lastAccessedAt, createdAt, updatedAt
}
```

## Admission gate

A pure, exhaustively testable predicate. Reject is the default; every admit needs three passes.

```
admit(candidate) =
     candidate.durability   != "volatile"
  && candidate.derivability != "trivial"
  && candidate.actionability != "context"
  && candidate.evidence.quote is non-empty
```

Rationale per clause:

- **`durability != volatile`** — the existing test, retained. Kills "remains unimplemented", "for now".
- **`derivability != trivial`** — the new test, and the highest-yield one. Kills
  `Memory type coloring uses CVA via typeColorVariants in @/lib/typeColors.ts` and the 104
  path-bearing entries that restate the repo back to itself. The code is the source of truth; a
  memory that duplicates it is a stale copy waiting to happen.
- **`actionability != context`** — kills inert description. If nothing a future session does would
  change, storing it only costs retrieval precision.
- **non-empty `evidence.quote`** — forces grounding in the transcript. An agent that cannot quote
  the user saying it is inventing it.

`correction` and `preference` are near-automatic passes (they are directives, by definition
non-derivable, and stated by the user). The gate does its real work on `decision` and `learning`,
which is exactly where the audit shows the rot.

### Worked examples from the current corpus

| Content (truncated) | D | Dv | A | Verdict |
|---|---|---|---|---|
| Postgres GUC placeholders reset to `''` not NULL on a pooled connection | permanent | hidden | constraint | **admit** |
| `ASPIRE_CONTAINER_RUNTIME=podman` — no config-file key exists for this | permanent | costly | directive | **admit** |
| Always use conventional commit format | stable | hidden | directive | **admit** |
| Biome 2.x is the linter for membank; replaced ESLint + Prettier | stable | trivial | context | reject |
| Memory type coloring uses CVA via `@/lib/typeColors.ts` | stable | trivial | context | reject |
| `@workspace/otel-*` packages follow the source-only pattern, no dist/ | stable | trivial | context | reject |

## Retention scoring

Admission is one-shot; a corpus also needs to shed. `RetentionSignals` feed a decay score computed
entirely by the system — no LLM, no per-memory cost.

```
retention(m) = w_type · typeWeight(m.type)
             + w_use  · accessCount/(accessCount + 10)
             + w_corr · corroborationCount/(corroborationCount + 3)
             - w_idle · idlePenalty(daysSinceLastAccess, m.durability)
```

`idlePenalty` is zero for `permanent` and ramps for `stable`, so a durable gotcha never rots out
while an unreferenced project decision eventually surfaces for review. Memories below a floor are
**surfaced in the dashboard triage view, never auto-deleted** — the corpus is user-authored and
silent deletion is not recoverable.

This deliberately reuses the shape of `query/domain/scoring.ts` rather than inventing a second
weighting scheme, but stays a separate function: retrieval ranking answers "which of these matches
the query", retention answers "should this exist at all". Fusing them would give one function two
jobs.

## Extraction pipeline changes

The agent currently classifies, deduplicates, and persists in one step, with policy in the prompt.
Split it so the agent only does what an LLM must:

```
transcript
  → [agent]  propose candidates, each with rubric fields + evidence   (LLM)
  → [domain] admit(candidate)                                          (pure, unit-tested)
  → [domain] classifyDuplicate(similarity)                             (pure, existing)
  → [app]    persist / update / flag
```

The agent's `save_memory` tool gains `durability`, `derivability`, `actionability`, and `evidence`
as required parameters. Making them required rather than optional is the point: the agent must
commit to a classification it can be evaluated against, and a rejected candidate can be logged with
the clause that rejected it, which makes the gate tunable against real data.

## Corollary fixes surfaced by the audit

These are independent of the rubric but block it from mattering:

1. **Transcript absent (`ENOENT`, 181 runs).** The path is already taken from the hook payload
   (`extract.ts` reads `transcript_path`), so this is the harness naming a file that is not on disk.
   127 of the 181 are sessions whose cwd was the user's home directory. Treat an absent transcript
   as a skip rather than a failure, retry once, and record `cwd` on the run row to identify the
   cause from data rather than hypothesis.
2. **Reap stuck runs (31 rows).** `decideClaim` only reclaims when the same session id is retried.
   Add a startup sweep that fails out `in_flight` rows older than the timeout.
3. **Raise `FLAG_THRESHOLD` 0.75 → 0.85.** Half the open review queue is 0.75–0.80 false positives;
   they are what made the queue not worth opening.
4. **Repair split project scope.** `scope/resolver.ts` hashes the git remote URL when one exists and
   the main worktree root otherwise, so a repo that gains an `origin` after membank first sees it
   silently forks into a second project. 59 memories are stranded across three such pairs.
   `merge-projects.ts` is the remedy for the existing data; resolution must adopt rather than fork.

5. **Native auto-memory conflict.** Claude Code's `autoMemoryEnabled` places memory-writing
   instructions in the system prompt pointing at `~/.claude/projects/<project>/memory/`. Those
   outrank an MCP tool for salience, so captures land in markdown files membank never reads, and
   both corpora are paid for in context. Detect and offer to disable — never disable silently.
