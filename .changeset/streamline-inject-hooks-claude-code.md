---
"@membank/cli": minor
---

For claude-code, dropped the in-session save_memory nudge and removed UserPromptSubmit from the default hook setup now that SessionEnd auto-extracts memories. Existing UserPromptSubmit membank entries in `~/.claude/settings.json` are auto-stripped on next `membank setup` run. Copilot-cli and codex are unchanged.
