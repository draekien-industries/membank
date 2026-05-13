---
"@membank/core": minor
"@membank/mcp": patch
"@membank/cli": patch
"@membank/dashboard": patch
---

Restructured all business logic into a layered domain/application/infrastructure architecture in core, making presentation packages (cli, mcp, dashboard) thin adapters with no SQL, no heavy native dependencies, and no direct infrastructure imports.
