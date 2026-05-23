# PermissionDenied

## Trigger

Fires when a tool call is denied by the auto-mode classifier (not by a user clicking deny in the permission dialog). This is an observability hook — the denial has already occurred and cannot be reversed.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on tool name. Same matching rules as `PreToolUse`.

## Default timeout

600 seconds

## `if` field

Supported. Same syntax as `PreToolUse`.

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "PermissionDenied",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "tool_name": "Bash",
  "tool_input": { "command": "sudo rm -rf /tmp/build" },
  "tool_use_id": "tool_abc123"
}
```

`tool_input` shapes are identical to those documented in [PreToolUse](PreToolUse.md#tool_input-shapes-by-tool).

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionDenied",
    "retry": true
  }
}
```

- `retry: true` — signals to Claude that it may retry the denied tool call (e.g., with a modified command)

## Exit code behavior

Cannot block. Exit code and stderr are ignored. This hook is observability-only.

## Config example

```json
{
  "hooks": {
    "PermissionDenied": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/log-denied-commands.sh",
            "async": true
          }
        ]
      },
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:9090/audit/denied",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

## Notes

- The denial has already been applied when this hook fires. This hook cannot reverse or modify the denial.
- `retry: true` is a hint to Claude, not an override of the denial. Claude may or may not choose to retry depending on context.
- This hook is fired by the **auto-mode classifier** (permission rules in auto/bypassPermissions modes). It does not fire when a human clicks "deny" in the interactive permission dialog.
- Use this hook for audit logging, metrics, alerting on denied operations, or coaching Claude toward valid alternatives.
