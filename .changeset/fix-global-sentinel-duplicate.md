---
"@membank/dashboard": patch
---

Fixed duplicate "global" cards on the projects landing screen caused by the sentinel project row being added to the DB while a hardcoded synthetic card still existed. The sentinel now renders via the standard project mapping. Also fixed the global workspace memory filter to use sentinel project membership instead of an empty-projects check, which was returning zero results after migration 7 backfilled all global memories.
