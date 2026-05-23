---
"@membank/core": minor
---

Added `incrementAccessCountBy(id, delta)` to `MemoryRepository` to enable writing a bulk delta in one DB statement instead of N individual calls.
