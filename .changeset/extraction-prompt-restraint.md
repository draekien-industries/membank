---
"@membank/core": patch
---

Tuned the extraction agent's system prompt to save nothing more readily: rules a project already documents in its instruction files now classify as trivially derivable, standing-rule phrasing only counts as a save signal when the user introduces or corrects it rather than merely citing it, and an empty candidate list ends the run without a tool call.
