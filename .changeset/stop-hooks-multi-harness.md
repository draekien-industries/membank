---
"@membank/cli": minor
---

Added Stop hook support for copilot-cli, codex, and opencode harnesses. Running `membank setup` now writes session-end hooks for all supported harnesses, prompting the LLM to save memories at the end of each session. Also adds `membank stop-hook --harness <name>` command used by those hooks.
