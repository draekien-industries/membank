---
"@membank/core": minor
"@membank/cli": minor
---

Session-end extraction now classifies every candidate memory on durability, derivability and actionability, quotes the transcript span that supports it, and passes it through a testable admission gate before anything is stored. The gate rejects candidates that are tied to the current task, learnable from one file read, purely descriptive, or unquoted — the last two being what filled the corpus with memories no session ever retrieved. Rejections are logged for 30 days so the gate can be tuned against real data, and `membank doctor` reports the counts by clause.
