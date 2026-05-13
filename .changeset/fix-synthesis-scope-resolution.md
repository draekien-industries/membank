---
"@membank/core": patch
"@membank/mcp": patch
"@membank/cli": patch
---

Fixed synthesis generating empty content when a human-readable project name (e.g. `parasol`) was passed as the scope — project names are now resolved to their scope hash before querying memories and storing the synthesis. The synthesis agent also now correctly filters memories by the target project instead of always using the current directory's project. The `synthesize status` command now shows project names instead of raw scope hashes.
