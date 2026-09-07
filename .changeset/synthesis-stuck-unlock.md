---
"@membank/dashboard": patch
"@membank/core": patch
"@membank/cli": minor
---

Fixed synthesis showing as stuck on the dashboard with no way out: the stuck state now only appears once a run outlives the timeout the synthesis engine itself uses, an "attempt unlock" control checks whether a process is really working on it before clearing the claim, and `membank doctor` reports and clears stuck syntheses instead of only stuck extraction runs.
