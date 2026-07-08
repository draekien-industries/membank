---
"@membank/core": patch
---

Made the memory extraction agent always check for near-duplicates before saving a new memory, and widened dedup matching to compare against memories of any type (not just an exact type match) — a same-type near-duplicate still auto-overwrites, while a cross-type near-duplicate is flagged for review instead of silently merged, so a fact re-classified under a different type no longer slips past dedup entirely.
