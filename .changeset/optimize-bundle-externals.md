---
"@membank/core": patch
"@membank/mcp": patch
"@membank/cli": patch
"@membank/dashboard": patch
---

Optimized published bundles: externalized `zod` from `core` and `mcp` to prevent duplicate instances in consumer projects, removed unused `@anthropic-ai/claude-agent-sdk` dependency from `mcp`, added `@membank/dashboard` to CLI's never-bundle list, and enabled minification on library outputs.
