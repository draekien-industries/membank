---
"@membank/core": patch
---

Added `@membank/core/client` subpath export with browser-safe domain constants, so dashboard client code can import `GLOBAL_SCOPE_HASH` and friends without pulling Node.js-only native modules into the browser bundle.
