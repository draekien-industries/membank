---
"@membank/core": patch
---

Added `initializeAndGetDirtyScopes` to `SynthesisRepository` so the synthesis startup sequence (clear stale in-flight markers, expire stale records, return dirty scopes) executes atomically in a single transaction.
