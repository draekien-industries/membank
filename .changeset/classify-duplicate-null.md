---
"@membank/core": patch
---

Changed `classifyDuplicate` to return `null` instead of `"none"` when no duplicate is detected, making the absence-of-match case idiomatic.
