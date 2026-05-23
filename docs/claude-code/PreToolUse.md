# PreToolUse

## Trigger

Fires after Claude creates tool parameters but before the tool executes. This is the primary hook for tool call interception, input modification, and custom permission logic.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on tool name. Supports exact names, pipe-delimited OR lists, and JavaScript regex.

Common tool names:
- `Bash`
- `Edit`
- `Write`
- `Read`
- `Glob`
- `Grep`
- `Agent`
- `WebFetch`
- `WebSearch`
- `AskUserQuestion`
- `ExitPlanMode`
- MCP tools: `mcp__<server>__<tool>` (e.g., `mcp__memory__save_memory`)

Match all tools from an MCP server: `mcp__memory__.*` (regex)

## Default timeout

600 seconds

## `if` field

Supported. Filters hook execution based on the tool input content:

- `"Bash(git *)"` — only run for Bash commands starting with `git`
- `"Edit(*.ts)"` — only run for edits to `.ts` files
- `"Bash(rm *)"` — only run for Bash commands starting with `rm`

For Bash: leading `VAR=value` assignments are stripped before pattern matching. If any subcommand in a compound command matches, the hook runs. If the command is too complex to parse, the hook always runs.

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "PreToolUse",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "tool_name": "Bash",
  "tool_use_id": "toolu_abc123",
  "tool_input": { }
}
```

### `tool_input` shapes by tool

**Bash:**
```json
{
  "command": "npm test",
  "description": "optional human-readable description",
  "timeout": 120000,
  "run_in_background": false
}
```

**Write:**
```json
{
  "file_path": "/absolute/path/to/file.txt",
  "content": "file content string"
}
```

**Edit:**
```json
{
  "file_path": "/absolute/path/to/file.txt",
  "old_string": "original text",
  "new_string": "replacement text",
  "replace_all": false
}
```

**Read:**
```json
{
  "file_path": "/absolute/path/to/file.txt",
  "offset": 0,
  "limit": 2000
}
```

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask|defer",
    "permissionDecisionReason": "string",
    "updatedInput": { },
    "additionalContext": "string"
  }
}
```

- `permissionDecision: "allow"` — approves the tool call; bypasses the permission prompt
- `permissionDecision: "deny"` — blocks the tool call
- `permissionDecision: "ask"` — shows the user a permission dialog
- `permissionDecision: "defer"` — falls through to normal permission flow (default when omitted)
- `permissionDecisionReason` — explanation shown alongside the decision
- `updatedInput` — modifies tool input fields before execution; if multiple hooks return `updatedInput`, last-write-wins
- `additionalContext` — context added to Claude's context window; persists even when the tool call fails (as of v2.1.141)

### Satisfying `AskUserQuestion`

A `PreToolUse` hook can answer a question Claude asked by returning:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": { "answer": "yes" }
  }
}
```

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed; `updatedInput` applied |
| 2 | Tool call blocked; stderr fed to Claude as context |
| 1 / other | Non-blocking error; hook output ignored |

## Config example

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/bash-guard.sh",
            "if": "Bash(rm *)",
            "timeout": 10,
            "statusMessage": "Validating command..."
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/file-write-audit.sh",
            "async": true
          }
        ]
      },
      {
        "matcher": "mcp__memory__.*",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/memory-pre-check.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

## Notes

- `permissionDecision: "deny"` and exit code 2 both block the tool call. Use `permissionDecision: "deny"` (JSON output) when you want to provide a structured reason to Claude. Use exit code 2 when you want to fail fast with stderr.
- `updatedInput` only needs to contain the fields you want to change — omitted fields retain their original values.
- Multiple `PreToolUse` hooks can all return `updatedInput`; they are applied in order, last-write-wins per field.
- `additionalContext` is not dropped on failure (v2.1.141+), meaning context injected here is available to Claude even if the tool call is blocked.
