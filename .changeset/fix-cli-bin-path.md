---
"@membank/cli": patch
---

Fixed bin entry path from `./dist/index.js` to `./dist/index.mjs` so `npx @membank/cli setup` resolves the binary correctly instead of falling back to a system PATH lookup.
