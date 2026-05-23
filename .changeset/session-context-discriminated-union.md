---
"@membank/core": patch
---

Replaced flat `SessionContext` type with a discriminated union on `mode` field, making the two modes (synthesis vs pinned) explicit and preventing silent zeroing of pinned arrays when synthesis is present.
