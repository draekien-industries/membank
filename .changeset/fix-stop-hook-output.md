---
"@membank/cli": patch
---

Fixed Stop hook output for claude-code harness to emit `{}` instead of an invalid `hookSpecificOutput` block, which caused a JSON schema validation error on session end.
