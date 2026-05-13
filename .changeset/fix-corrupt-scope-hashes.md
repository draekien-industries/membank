---
"@membank/core": patch
"@membank/mcp": patch
---

Added schema migration (v5) that removes projects with non-hex scope_hash values (merging their memories into valid counterparts where possible), and adds a CHECK constraint to prevent corrupt scope_hash values from being inserted in future. Also added application-level validation in `ProjectRepository.upsertByHash()` that rejects hashes not matching the 16-character lowercase hex format.
