---
"@membank/core": minor
"@membank/cli": minor
---

Extraction now skips sessions whose transcript is missing instead of recording a failure, retrying once in case the harness has not flushed the file yet, and reaps in-flight runs whose process died so they no longer block re-extraction. A new `membank doctor` command reports stuck runs, project scopes split between a local path and a git remote, the 30-day extraction failure rate, and Claude Code's native auto-memory — which competes with membank for captures — with `--fix` to apply repairs after confirmation. `membank setup` now detects the same auto-memory conflict and offers to turn it off, never writing the setting under `--yes` or `--json`.
