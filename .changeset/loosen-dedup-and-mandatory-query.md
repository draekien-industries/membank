---
"@membank/core": patch
---

Made the memory extraction agent always check for near-duplicates before saving a new memory, and widened automatic dedup matching to compare against memories of any type (not just an exact type match), so a fact re-classified under a different type no longer slips past dedup as a duplicate.
