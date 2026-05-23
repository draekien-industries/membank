# ElicitationResult

## Trigger

Fires after the user responds to an MCP elicitation dialog, before the response is sent back to the MCP server. This hook can modify the user's submitted values or block the response from being sent.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on the MCP server name (not the full tool name).

Examples:
- `"my_server"` — matches elicitation results from the `my_server` MCP server
- `""` / `"*"` / omitted — matches all

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "ElicitationResult",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "server_name": "my_server",
  "tool_name": "mcp__my_server__some_tool",
  "tool_use_id": "toolu_abc123",
  "user_action": "accept|decline|cancel",
  "form_values": {
    "field_name": "value_the_user_submitted",
    "another_field": "another_value"
  }
}
```

- `server_name` — name of the MCP server that requested the elicitation
- `tool_name` — full MCP tool name (`mcp__<server>__<tool>`) that triggered the elicitation
- `tool_use_id` — unique identifier for the tool call that triggered the elicitation
- `user_action` — what the user did in the dialog:
  - `"accept"` — user submitted the form with values
  - `"decline"` — user declined the request
  - `"cancel"` — user cancelled/closed the dialog
- `form_values` — the values submitted by the user; present when `user_action` is `"accept"`

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "ElicitationResult",
    "action": "accept|decline|cancel",
    "content": {
      "field_name": "modified_value"
    }
  }
}
```

- `action: "accept"` — sends the response (using `content` values if provided, otherwise original `form_values`)
- `action: "decline"` — overrides user's acceptance to a decline; response sent as decline
- `action: "cancel"` — overrides user's response to a cancel; tool call aborted
- `content` — override values sent to the server in place of `form_values`; only meaningful with `action: "accept"`

If no output is returned, the user's original response is sent to the server unchanged.

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed |
| 2 | Response becomes `"decline"`; not sent to server |
| 1 / other | Non-blocking error; original user response sent unchanged |

## Config example

```json
{
  "hooks": {
    "ElicitationResult": [
      {
        "matcher": "my_database_server",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/sanitize-elicitation-result.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### Example: strip whitespace from user input and audit the submission

```bash
#!/usr/bin/env bash
INPUT=$(cat)
USER_ACTION=$(echo "$INPUT" | jq -r '.user_action')
SERVER_NAME=$(echo "$INPUT" | jq -r '.server_name')

# Only process accepted responses
if [ "$USER_ACTION" = "accept" ]; then
  # Trim whitespace from all form values
  CLEANED=$(echo "$INPUT" | jq '.form_values | map_values(ltrimstr(" ") | rtrimstr(" "))')
  
  # Log to audit trail
  echo "$INPUT" >> "$HOME/.claude/elicitation-audit.jsonl"
  
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"ElicitationResult\",\"action\":\"accept\",\"content\":$CLEANED}}"
fi
```

## Notes

- This hook fires only after the user has interacted with the dialog. To intercept elicitations before showing the dialog, use the `Elicitation` hook instead.
- `action: "decline"` or `"cancel"` in the output overrides even an `"accept"` from the user. This can be used for post-submission validation that blocks the response if invalid.
- `content` in the output replaces `form_values` entirely — it is not merged. Include all fields that should be sent to the server, not just the ones you modified.
- Exit code 2 converts the response to `"decline"` regardless of what the user submitted.
- `server_name` in the event-specific input matches the matcher. The matcher is on server name only, not the full `mcp__server__tool` pattern.
