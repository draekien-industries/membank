---
"@membank/cli": minor
---

Removed stop hook setup from all harnesses (claude-code, copilot-cli, codex, opencode) to prevent infinite tool-call loops triggered by the hook itself.
