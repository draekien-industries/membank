---
"@membank/cli": minor
---

Added `UserPromptSubmit` and `PostToolUseFailure` hook injection support. Running `membank setup` now registers three hooks per harness: session-start (existing), user-prompt (detects feedback in prompts and reminds Claude to save it), and tool-failure (reminds Claude to save a memory when a tool fails). Supports all four harnesses: claude-code, copilot-cli, codex, and opencode.
