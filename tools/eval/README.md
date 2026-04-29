# @membank/eval

Internal tooling. Not published. Sweeps `MEMORY_GUIDANCE` prompt variants against Claude Haiku across all four supported harnesses to find the most reliable autonomous-trigger wording for `save_memory`.

See `C:\Users\William\.claude\plans\using-haiku-subagents-analyse-recursive-kahan.md` for the methodology.

## Run

Copy `tools/eval/.env.example` to `tools/eval/.env` and fill in your `ANTHROPIC_API_KEY`. The `.env` file is gitignored. Alternatively `export ANTHROPIC_API_KEY=...` in your shell — both work. The CLI looks for the key in `tools/eval/.env`, then the repo-root `.env`, then the process environment.

```bash
cp tools/eval/.env.example tools/eval/.env  # then edit it
pnpm install
pnpm --filter @membank/eval build

# Smoke first (~30s, ~$0.01)
pnpm --filter @membank/eval smoke

# Full sweep (~60 min, ~$25-35)
pnpm --filter @membank/eval sweep \
  --prompts control,V1,V2,V3,V4,V5,V6,V7 \
  --harnesses claude-code,copilot-cli,codex,opencode \
  --pin-states empty,populated \
  --reps 5 \
  --concurrency 8

# Re-emit report from existing results JSONL
pnpm --filter @membank/eval report
```

Outputs land in `tools/eval/results/`:

- `runs-<iso>.jsonl` — one row per Haiku call (raw)
- `report-<iso>.md` — human-readable summary, per-harness winners
- `winners.json` — machine-readable mapping for follow-up PR

## Methodology summary

- 8 prompts (`control` + `V1`..`V7`)
- 16 scenarios (8 user-decision + 8 tool-failure-recovery, across short/medium/long context lengths)
- 4 harnesses, each simulating its real injection slot per `packages/cli/src/commands/inject.ts:39-62`
- 2 pin states (empty / populated)
- 5 reps per cell @ temperature 0.7 → **5120 runs**
- Scoring: rule-based (called / type / over-save) + Sonnet judge (intent / FP)
- Wilson 95% CI per `(prompt, harness)` rollup

No fixture contains explicit save-hints. A vitest guard fails the build if forbidden phrases sneak in.
