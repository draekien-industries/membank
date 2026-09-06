---
"@membank/core": minor
"@membank/mcp": patch
"@membank/cli": patch
"@membank/dashboard": patch
---

Replaced the native better-sqlite3 driver with Node's built-in node:sqlite, so running membank through npx no longer fails with ERR_DLOPEN_FAILED when the invoking Node version differs from the one that populated the npx cache. All four packages now declare a Node >=24 engine, giving a clear EBADENGINE error on older runtimes instead of a cryptic module failure.
