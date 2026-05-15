# activity — bounded context

Provides a 30-day rolling audit trail of memory lifecycle and query events per project.

## Prune-on-write

`logEvent()` deletes rows older than `RETENTION_DAYS` (30) immediately after each insert. The `idx_activity_project_created` index bounds the delete to an index scan, keeping it sub-millisecond on a small local DB. This is the project's preferred pattern for bounded retention: no background job, no cron, just prune on the write path.
