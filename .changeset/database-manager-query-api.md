---
"@membank/core": minor
---

Added `query`, `one`, `mutate` and `inTransaction` to `DatabaseManager`, so callers can run SQL without reaching for the underlying driver, and exposed a `@membank/core/test-support` entry with database seeding helpers for downstream test suites.
