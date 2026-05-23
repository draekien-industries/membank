---
"@membank/core": patch
---

Added `atomicMerge` to `MemoryRepository`, collapsing the 5-step merge sequence into a single SQLite transaction to prevent partial-merge corruption.
