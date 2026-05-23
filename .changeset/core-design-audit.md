---
"@membank/core": patch
---

Refactored core package internals to address design-principle violations identified in audit: eliminated temporal decomposition in merge and synthesis init, fixed Law of Demeter violations on the Memory type, corrected information hiding in the query layer, and removed several shallow or duplicate abstractions.
