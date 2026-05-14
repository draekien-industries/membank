---
"@membank/cli": minor
"@membank/core": minor
"@membank/mcp": minor
---

Reworked the Claude Code Stop hook into an async, out-of-session memory extraction agent. When a session ends, the hook fires `membank extract` in the background; that command spawns an independent Claude Haiku agent that reads the session transcript and saves durable corrections, preferences, decisions, learnings, and facts via its own `save_memory` / `update_memory` tools. The extractor runs in its own Claude conversation with `settingSources: []` so it does not inherit the host's MCP servers or built-in tools — preventing the infinite Stop-loop that forced the previous attempt's rollback, and ensuring its tool calls land in the membank DB through the in-process SDK MCP server rather than the host's globally-configured `mcp__membank__*` tools.

Applied the same isolation fix to the synthesis agent runner (`settingSources: []`, fully-qualified `mcp__membank-synthesis-tools__*` allowlist, host membank disallowed) so synthesis always reads from the services it was wired with rather than the host's globally-configured server.

Stop / session-end hook setup for copilot-cli, codex, and opencode is removed pending verified session-end input contracts for those harnesses.
