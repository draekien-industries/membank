# Notification

## Trigger

Fires when Claude Code sends a notification to the user. Use this hook to intercept notifications for logging, routing to external systems, or triggering desktop notifications.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on the `notification_type` field value:

| Matcher | Fires when |
|---|---|
| `"permission_prompt"` | A permission dialog is shown to the user |
| `"idle_prompt"` | Claude is idle and awaiting user input |
| `"auth_success"` | Authentication completes successfully |
| `"elicitation_dialog"` | An MCP elicitation dialog is shown |
| `"elicitation_complete"` | An MCP elicitation is completed |
| `"elicitation_response"` | User responds to an MCP elicitation |
| `""` / `"*"` / omitted | All notification types |

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "Notification",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "notification_type": "permission_prompt|idle_prompt|auth_success|elicitation_dialog|elicitation_complete|elicitation_response",
  "message": "human-readable notification message"
}
```

- `notification_type` — the category of notification
- `message` — the notification message text

## Output

No decision control. Standard output fields are available but have no effect on notification behavior:

```json
{
  "terminalSequence": "\033]9;Notification message\007"
}
```

`terminalSequence` is the most useful output field for this hook — use it to trigger a desktop notification or update the terminal title.

Only OSC 0/1/2/9/99/777 and BEL terminal sequences are permitted.

## Exit code behavior

Cannot block. Exit code 2 shows stderr to the user only. This hook is observability-only.

## Config example

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/desktop-notify.sh",
            "async": true,
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/log-permission-prompt.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

### Example: desktop notification on idle

```bash
#!/usr/bin/env bash
# desktop-notify.sh — reads hook JSON from stdin
INPUT=$(cat)
MESSAGE=$(echo "$INPUT" | jq -r '.message')
# macOS
osascript -e "display notification \"$MESSAGE\" with title \"Claude Code\""
# Linux (notify-send)
# notify-send "Claude Code" "$MESSAGE"
```

## Notes

- This hook cannot suppress or modify notifications — it is purely observational.
- The `terminalSequence` output is the primary mechanism for driving desktop notifications via terminal OSC sequences (e.g., iTerm2 growl notifications via OSC 9, or Wezterm notifications via OSC 777).
- `async: true` is recommended for notification handlers to avoid adding latency to the main Claude Code flow.
- Elicitation-related notification types (`elicitation_dialog`, `elicitation_complete`, `elicitation_response`) provide visibility into the MCP elicitation lifecycle without the ability to intercept or modify values — use the `Elicitation` and `ElicitationResult` hooks for that.
