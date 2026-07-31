---
"@membank/core": minor
"@membank/dashboard": minor
---

Added retention scoring so a memory that no session ever retrieves eventually surfaces for review. Score combines type weight, retrieval count, and a new corroboration count — incremented when a save re-affirms an existing memory instead of that signal being discarded — against an idle penalty that never touches a permanent memory and ramps for a stable one. Low-scoring memories appear in a new dashboard Retention lane for bulk deletion; nothing is ever deleted automatically.
