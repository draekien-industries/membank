---
"@membank/core": minor
"@membank/dashboard": patch
---

Raised the dedup review threshold from 0.75 to 0.85 so topically adjacent memories are no longer flagged as near-duplicates. Half of every review queue was pairs in the 0.75–0.85 band that were never duplicates, which is what made the queue not worth opening. Auto-overwrite stays at 0.92.
