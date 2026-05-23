---
"@membank/cli": minor
---

Added post-compact context refresh: claude-code and codex `SessionStart` hooks now match `compact` source so membank context is re-injected after compaction; opencode plugin clears its inject dedup via `experimental.compaction.autocontinue` so context re-appears on the first LLM call after compaction; removed redundant `UserPromptSubmit` injection from codex.
