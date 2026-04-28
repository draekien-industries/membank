---
"@membank/cli": patch
---

Fixed setup command to use each vendor's native MCP installation CLI, resolving incorrect config location for claude-code (now uses `claude mcp add --scope user` writing to `~/.claude.json`), wrong config format for codex (now uses `codex mcp add` writing correct TOML), and wrong path and schema for opencode (now writes to `~/.config/opencode/opencode.json` with `type: "local"` and command as an array).
