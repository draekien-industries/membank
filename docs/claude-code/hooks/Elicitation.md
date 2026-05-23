# Elicitation

## Trigger

Fires when an MCP server requests user input via the elicitation protocol during a tool call. This hook can provide the response automatically without showing a dialog to the user.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on the MCP server name (not the full tool name).

Examples:
- `"my_server"` — matches elicitations from the `my_server` MCP server
- `""` / `"*"` / omitted — matches all MCP server elicitations

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "Elicitation",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "elicitation_id": "elicit_abc123",
  "tool_name": "mcp__server_name__tool_name",
  "form_fields": [
    {
      "name": "field_name",
      "label": "Human-readable label for the field",
      "type": "text|password|select",
      "required": true,
      "options": ["option1", "option2"]
    }
  ]
}
```

- `elicitation_id` — unique identifier for this elicitation request
- `tool_name` — the full MCP tool name that triggered the elicitation (`mcp__<server>__<tool>`)
- `form_fields` — array of fields the MCP server is requesting values for:
  - `name` — field identifier (used as key in the response `content`)
  - `label` — display label shown to users
  - `type` — field type: `"text"` (free text), `"password"` (masked), `"select"` (dropdown)
  - `required` — whether the field is required
  - `options` — array of valid values; present only when `type` is `"select"`

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "Elicitation",
    "action": "accept|decline|cancel",
    "content": {
      "field_name": "value",
      "another_field": "another_value"
    }
  }
}
```

- `action: "accept"` — provides field values; dialog is not shown to the user
- `action: "decline"` — user declines the elicitation request; dialog is not shown
- `action: "cancel"` — aborts the tool call that triggered the elicitation; dialog is not shown
- `content` — map of field names to values; required when `action` is `"accept"`; omitted for other actions

If the hook does not return a hookSpecificOutput or returns no action, the elicitation dialog is shown to the user as normal.

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed |
| 2 | Elicitation declined; dialog not shown |
| 1 / other | Non-blocking error; dialog shown to user as normal |

## Config example

```json
{
  "hooks": {
    "Elicitation": [
      {
        "matcher": "my_database_server",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/auto-fill-db-credentials.sh",
            "timeout": 10,
            "statusMessage": "Retrieving credentials..."
          }
        ]
      }
    ]
  }
}
```

### Example: auto-fill credentials from a secrets manager

```bash
#!/usr/bin/env bash
INPUT=$(cat)

# Extract which fields are being requested
FIELDS=$(echo "$INPUT" | jq -r '[.form_fields[].name] | join(",")')

if [[ "$FIELDS" == *"username"* ]] && [[ "$FIELDS" == *"password"* ]]; then
  # Retrieve from system keychain or secrets manager
  USERNAME=$(security find-generic-password -s "my-db" -a "user" -w 2>/dev/null)
  PASSWORD=$(security find-generic-password -s "my-db" -a "pass" -w 2>/dev/null)
  
  if [ -n "$USERNAME" ] && [ -n "$PASSWORD" ]; then
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"Elicitation\",\"action\":\"accept\",\"content\":{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}}}"
    exit 0
  fi
fi

# Fall through to show dialog
```

## Notes

- The matcher targets the MCP server name, not the full `mcp__server__tool` format. Use the server name only.
- `action: "cancel"` aborts the tool call entirely. `action: "decline"` tells the server the user declined but does not necessarily abort the tool call — the MCP server decides how to handle a decline.
- `content` keys must exactly match the `name` fields in `form_fields`. Extra keys are ignored; missing required fields result in the server receiving an incomplete response.
- `type: "password"` fields should be handled carefully — avoid logging their values.
- `options` is only present for `type: "select"` fields. The `content` value for a select field must be one of the values in `options`.
- Use the `ElicitationResult` hook if you need to intercept or modify user responses after the dialog has been shown.
