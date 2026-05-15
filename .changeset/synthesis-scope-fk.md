---
"@membank/core": patch
---

Migrated `syntheses.scope` from the legacy `"global"` string to the sentinel scope hash, adding a foreign key from `syntheses.scope` to `projects.scope_hash` and eliminating all remaining `scope === "global"` magic-string branches.
