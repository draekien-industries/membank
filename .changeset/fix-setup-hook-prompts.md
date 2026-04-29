---
"@membank/cli": patch
---

Fixed setup command to prompt for each injection hook individually and perform a single write per harness, so the CLI accurately reflects what is written to the vendor config file.
