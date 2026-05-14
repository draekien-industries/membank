---
"@membank/dashboard": patch
---

Added a reset mechanism for stuck synthesis: after 60 seconds in-flight, a "Taking too long? Reset" affordance appears that clears the flag and allows retriggering.
