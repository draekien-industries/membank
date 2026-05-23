---
"@membank/core": patch
---

Fixed config loader silently swallowing all errors; now only suppresses ENOENT so malformed config.json surfaces to the user.
