---
"@membank/core": minor
"@membank/dashboard": minor
---

Added on-demand synthesis triggers to the project Overview tab: a "Synthesize all" action and per-type controls in the session-injection preview. Each memory type can be synthesized or regenerated individually, including verbatim sections that have grown past the synthesis word-count threshold but are not yet synthesized. "Synthesize all" and the per-type triggers now respect the threshold and only act on the project's own memories, so borrowed global sections stay read-only. Also fixed long synthesis summaries overflowing onto the sections below them in the preview.
