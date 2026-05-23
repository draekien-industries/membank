# Claude Code Hooks — Configuration Reference

## settings.json shape

```json
{
  "hooks": {
    "<EventName>": [
      {
        "matcher": "<pattern>",
        "hooks": [ <handler>, ... ]
      }
    ]
  },
  "disableAllHooks": false
}
```

`disableAllHooks: true` disables all hooks for the session without removing them from config.

## File locations

Lower in this list = higher priority. Settings are merged; later sources override earlier ones.

- `~/.claude/settings.json` — user-global
- `.claude/settings.json` — project-level, committed to version control
- `.claude/settings.local.json` — project-level, gitignored
- Managed policy settings — org-wide, read-only
- Plugin `hooks/hooks.json` — active only while plugin is enabled
- Skill/agent frontmatter — active only for component lifetime

## Matcher pattern rules

- `"*"`, `""`, or omitted → match all
- Only letters, digits, `_`, `|` → exact string or pipe-delimited OR list (e.g., `"init|maintenance"`)
- Any other character present → treated as a JavaScript regex

MCP tool name format: `mcp__<server>__<tool>`. To match all tools from a server: `mcp__memory__.*`

**Events that do not support matchers** (matcher fields are silently ignored):
`UserPromptSubmit`, `PostToolBatch`, `Stop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `WorktreeCreate`, `WorktreeRemove`, `CwdChanged`

## Handler types

### `command`

```json
{
  "type": "command",
  "command": "/path/to/script.sh",
  "args": ["--flag", "value"],
  "timeout": 600,
  "statusMessage": "Validating...",
  "once": false,
  "if": "Bash(git *)",
  "async": false,
  "asyncRewake": false,
  "shell": "bash"
}
```

- `args` present → exec form: binary invoked directly, no shell interpolation
- `args` absent → shell form: `sh -c` on Unix, PowerShell on Windows
- `async: true` → runs in background, non-blocking
- `asyncRewake: true` → background + wakes Claude when process exits with code 2 (implies `async: true`). Hook's stderr (or stdout if stderr is empty) is shown to Claude as a system reminder
- `shell`: `"bash"` or `"powershell"` — overrides default shell for shell-form commands

### `http`

```json
{
  "type": "http",
  "url": "http://localhost:8080/hook",
  "headers": { "Authorization": "Bearer $TOKEN" },
  "allowedEnvVars": ["TOKEN"],
  "timeout": 600,
  "statusMessage": "Validating...",
  "once": false,
  "if": "Bash(git *)"
}
```

POSTs the event JSON as the request body.

HTTP response semantics:

- 2xx + empty body → success, no output
- 2xx + plain text body → text added as context
- 2xx + JSON body → parsed as hook output JSON (same shape as command stdout)
- non-2xx → non-blocking error
- connection failure or timeout → non-blocking error

### `mcp_tool`

```json
{
  "type": "mcp_tool",
  "server": "my_server",
  "tool": "tool_name",
  "input": { "param": "${tool_input.file_path}" },
  "timeout": 600,
  "statusMessage": "Running...",
  "once": false,
  "if": "Edit(*.ts)"
}
```

The MCP server must be connected. `${path}` expressions in `input` are substituted from hook input fields.

### `prompt`

```json
{
  "type": "prompt",
  "prompt": "Is this safe? $ARGUMENTS",
  "model": "claude-haiku-4-5",
  "timeout": 30
}
```

`$ARGUMENTS` is replaced with the hook input JSON. Default timeout: 30s.

### `agent`

```json
{
  "type": "agent",
  "prompt": "Verify: $ARGUMENTS",
  "timeout": 60
}
```

Default timeout: 60s. Maximum 50 tool turns. Experimental. Currently supported only on `Stop` and `SubagentStop`.

## Common handler fields

| Field | Type | Default | Description |
|---|---|---|---|
| `timeout` | number | 600 | Seconds before handler is killed (30 for `prompt`, 60 for `agent`) |
| `statusMessage` | string | — | Custom spinner text shown during execution |
| `once` | boolean | false | Run once per session (skills/agents only) |
| `if` | string | — | Permission-rule filter; only valid on tool events |

### `if` field syntax

Only applicable on: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`.

Format: `ToolName(pattern)`. Single rule only; `&&`/`||` are not supported.

Examples:
- `"Bash(git *)"` — matches Bash commands starting with `git`
- `"Edit(*.ts)"` — matches edits to `.ts` files
- `"Bash(rm *)"` — matches rm commands

For Bash: leading `VAR=value` assignments are stripped before matching. Hook runs if any subcommand in a compound command matches. If the command is too complex to parse, the hook always runs.

## Environment variables (command handlers)

| Variable | Available on |
|---|---|
| `CLAUDE_ENV_FILE` | `SessionStart`, `Setup`, `CwdChanged`, `FileChanged` |
| `CLAUDE_PROJECT_DIR` | All command hooks |
| `CLAUDE_PLUGIN_ROOT` | All command hooks (plugin context) |
| `CLAUDE_PLUGIN_DATA` | All command hooks (plugin context) |
| `CLAUDE_EFFORT` | All command hooks |
| `CLAUDE_CODE_REMOTE` | All command hooks (`"true"` in remote web environments) |
| `CLAUDE_CODE_SESSION_ID` | All command hooks (matches `session_id` from input JSON) |

`CLAUDE_ENV_FILE` points to a file where the handler can write `KEY=VALUE` lines to persist environment variables into the Claude session. Variables written here survive across tool calls and directory changes.

## Common input fields (all events, delivered via stdin)

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "EventName",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "agent_id": "string",
  "agent_type": "string"
}
```

`agent_id` and `agent_type` are present only when the hook fires in subagent context.

## Common output fields (stdout JSON, exit code 0)

```json
{
  "continue": true,
  "stopReason": "string",
  "suppressOutput": false,
  "systemMessage": "string",
  "terminalSequence": "\033]0;Title\007",
  "hookSpecificOutput": { ... }
}
```

- `continue: false` → stops Claude entirely; takes precedence over `decision: "block"`; `stopReason` is shown to the user
- `suppressOutput: true` → hides hook stdout from the transcript viewer (Ctrl-R)
- `systemMessage` → warning shown to the user in the UI
- `terminalSequence` → terminal escape sequence; only OSC 0/1/2/9/99/777 and BEL are permitted

JSON output is only processed when exit code is 0. stdout is truncated at 10,000 characters.

## Exit code semantics

| Code | Meaning | JSON processed |
|---|---|---|
| 0 | Success | Yes |
| 2 | Blocking error | No — stderr fed to Claude or shown to user |
| 1 | Non-blocking error | No |
| Other | Non-blocking error | No |

## Blocking behavior by event (exit code 2)

| Event | Effect of exit code 2 |
|---|---|
| `PreToolUse` | Tool call cancelled; stderr fed to Claude |
| `PermissionRequest` | Permission denied |
| `UserPromptSubmit` | Prompt blocked and erased |
| `UserPromptExpansion` | Slash command expansion cancelled |
| `Stop` | Claude does not stop responding |
| `SubagentStop` | Subagent continues working |
| `TeammateIdle` | Teammate does not go idle |
| `TaskCreated` | Task creation rolled back |
| `TaskCompleted` | Task not marked complete |
| `ConfigChange` | Config change not applied |
| `PreCompact` | Compaction does not occur |
| `PostToolBatch` | Agentic loop stops before next model call |
| `WorktreeCreate` | Worktree not created (any non-zero exit) |
| `PostToolUse` | No blocking (tool already ran) |
| `PostToolUseFailure` | No blocking (tool already failed) |
| `PermissionDenied` | No blocking (denial already occurred) |
| `StopFailure` | Observability only — exit code ignored |
| `Notification` | Observability only — exit code ignored |
| `SubagentStart` | Cannot block; stderr shown to user |
| `InstructionsLoaded` | Audit logging only |
| `SessionStart` | Informational |
| `Setup` | Shows stderr to user; cannot block Setup |
| `SessionEnd` | Observability only — exit code ignored |
| `PostCompact` | Observability only |
| `CwdChanged` | Non-blocking |
| `FileChanged` | Non-blocking |
| `WorktreeRemove` | Failures logged in debug mode only |
| `ElicitationResult` | Response becomes "decline" |
