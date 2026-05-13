---
"@membank/core": patch
---

Integrated cosine similarity into memory scoring formula to prioritize semantic relevance over type weight, rebalancing from `typeWeight × 0.4` to `cosine_sim × 0.4 + typeWeight × 0.25`
