---
"@membank/cli": patch
---

Replaced ad-hoc CLI input validation with zod schemas; invalid `--type`, `--harness`, `--limit`, `--port`, migrate mode, and import-file shape now produce uniform, descriptive errors instead of silently accepting bad input.
