---
"@membank/core": patch
---

Introduced a sentinel global project (scope_hash `0000000000000000`, id `00000000-0000-0000-0000-000000000000`) so every memory has an explicit `memory_projects` row, eliminating `NOT IN` subqueries and fixing a bug where global memories were silently excluded from project-scoped semantic queries.
