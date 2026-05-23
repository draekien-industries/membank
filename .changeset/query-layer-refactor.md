---
"@membank/core": patch
---

Refactored query layer to inject QueryAdapter into QueryEngine, moved Buffer conversion and incrementAccessCount into the adapter, and added createQueryEngine factory to keep SqliteQueryAdapter private.
