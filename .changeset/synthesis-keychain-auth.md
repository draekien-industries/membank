---
"@membank/mcp": patch
"@membank/cli": patch
---

Fixed synthesis failing for users authenticated via `claude auth login` (keychain) by removing the incorrect pre-flight env var check; updated setup prompt to list all three valid auth paths (keychain, ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN).
