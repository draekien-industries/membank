---
"@membank/cli": minor
---

Removed `@membank/dashboard` as a CLI dependency, significantly reducing the `npx @membank/cli` install footprint. The `membank dashboard` command now prints a migration message directing users to `npx @membank/dashboard`. Added `membank setup upgrade` to automatically migrate existing harness configs from `npx @membank/cli --mcp` to the new `npx @membank/mcp` standalone binary. New harness setups configured by `membank setup` now use `npx @membank/mcp` by default.
