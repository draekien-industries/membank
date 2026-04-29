---
'@membank/cli': minor
---

Removed the `user-prompt` and `tool-failure` injection events — only `SessionStart` is now used. Stale hooks from prior versions are tolerated at runtime (silent no-op) and pruned from settings on the next `membank setup` run. The SessionStart memory guidance prompt was rewritten as a stronger cost-of-omission framing chosen empirically across 18 isolated subagent A/B runs (haiku, 6 variants × 3 reps × 6 scenarios; winner scored 28/30 vs 24/30 for the previous version, with higher save-type accuracy on correction/preference/decision scenarios).
