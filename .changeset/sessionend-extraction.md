---
"@membank/cli": patch
---

Switched memory extraction trigger from the `Stop` hook (fired every turn) to the `SessionEnd` hook (fired once per session), eliminating the recursion bug class and reducing unnecessary LLM synthesis calls. Existing installs must re-run `membank setup` to migrate the hook entry in `~/.claude/settings.json`.
