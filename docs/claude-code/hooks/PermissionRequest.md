# PermissionRequest

## Trigger

Fires when Claude Code is about to display a permission dialog asking the user to approve or deny a tool call. This hook can auto-approve or auto-deny without showing the dialog.

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
  "hook_event_name": "PermissionRequest",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "tool_name": "Bash",
  "tool_input": { },
  "tool_use_id": "toolu_abc123"
}
```

`tool_input` shapes are identical to those documented in [PreToolUse](PreToolUse.md#tool_input-shapes-by-tool).

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow|deny",
      "updatedInput": { },
      "applyRule": "Bash(git *)"
    }
  }
}
```

- `behavior: "allow"` — auto-approves the permission request; dialog is not shown to the user
- `behavior: "deny"` — auto-denies the permission request; dialog is not shown to the user
- `updatedInput` — modifies tool input when `behavior` is `"allow"`; the modified input is re-checked against `permissions.deny` rules (security fix v2.1.136)
- `applyRule` — a permission rule string that is applied to future matching requests for the session (e.g., `"Bash(git *)"`)

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed |
| 2 | Permission denied; dialog not shown |
| 1 / other | Non-blocking error; dialog shown to user as normal |

## Config example

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/auto-approve-bash.sh",
            "if": "Bash(git *)",
            "timeout": 5,
            "statusMessage": "Checking permission..."
          }
        ]
      },
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/file-permission-policy.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

## Notes

- `PermissionRequest` fires specifically when a permission dialog would be shown. `PreToolUse` fires for every tool call regardless of whether a permission dialog is involved. For auto-approval logic, `PermissionRequest` is the more targeted hook.
- When `updatedInput` is provided with `behavior: "allow"`, the modified input is re-validated against `permissions.deny` rules. A hook cannot use `updatedInput` to bypass deny rules.
- `applyRule` persists for the session. Use it to build up a whitelist of approved patterns as the user works, reducing future permission prompts for similar operations.
- `behavior: "deny"` does not feed any reason to Claude. To provide context when blocking, combine with `additionalContext` in common output fields, or use `PreToolUse` with `permissionDecision: "deny"` and `permissionDecisionReason`.
