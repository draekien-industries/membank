---
"@membank/core": minor
"@membank/mcp": minor
"@membank/cli": minor
"@membank/dashboard": minor
---

Replaced the `needs_review` boolean on memories with a `memory_review_events` table that captures why each memory was flagged — including similarity score, conflicting memory id, and a content snapshot. The `Memory` type now carries `reviewEvents: ReviewEvent[]` instead of `needsReview: boolean`. MCP `query_memory` responses include review event details. A new `membank review` CLI command lists flagged memories with reasons and supports `--resolve <id>` to clear them. The dashboard detail panel shows a collapsible review reasons card.

**Breaking change:** `Memory.needsReview` removed — use `memory.reviewEvents.length > 0` to check review status.
