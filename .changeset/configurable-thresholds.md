---
"@membank/core": minor
"@membank/mcp": minor
"@membank/cli": minor
"@membank/dashboard": minor
---

Made the dedup and retention thresholds user-configurable via a `thresholds` block in `~/.membank/config.json`, and lowered the default retention floor from 0.3 to 0.1. The old floor sat above the type weight of a learning or decision, so those memories were flagged for review the day they were written — on a real 705-memory corpus it flagged 88% of it. An invalid threshold now fails with the offending key instead of being silently ignored.
