---
"@membank/core": patch
"@membank/mcp": patch
---

Fix in-flight synthesis markers getting permanently stuck after a process crash on non-dirty scopes. Engine now clears stale markers at startup using the same timeout threshold as the debounce loop.
