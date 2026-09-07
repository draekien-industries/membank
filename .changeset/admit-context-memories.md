---
"@membank/core": minor
"@membank/cli": minor
---

Stopped rejecting memories for being purely descriptive. The admission gate's `inert` clause assumed a memory only reaches a session that goes looking for it, but synthesis injects the stored corpus into the session prompt unprompted — so a memory that describes state still shapes the session. Durable, non-derivable candidates are now admitted regardless of actionability, and `membank rejected` lists what the gate did reject with `--promote <id>` to override it by hand.
