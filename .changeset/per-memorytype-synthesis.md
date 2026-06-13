---
"@membank/core": minor
"@membank/cli": minor
"@membank/mcp": minor
"@membank/dashboard": minor
---

Injected memory now shows pinned memories verbatim and a separate synthesis per memory type — with small groups quoted in full below a configurable word-count threshold — and any pre-existing combined synthesis is regenerated automatically on upgrade, so sessions start with sharper, type-aware context. The `synthesize` version commands (`show --version`, `diff`, `revert`) now take a required `--type`, and `history` shows a Type column with an optional `--type` filter.
