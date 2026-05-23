# notification

## Overview

Fires when the CLI emits a system notification — for example, when a shell command completes, the agent goes idle, or a permission prompt appears. Can inject additional context as a user message into the session. CLI-only; does not fire in Cloud Agent.

## Surfaces

| Surface | Supported | Notes |
|---|---|---|
| CLI | Yes | Full support including `additionalContext` output |
| Cloud Agent | No | This hook never fires in Cloud Agent environments |
| VS Code | No | Not documented for VS Code |
| JetBrains | No | Not documented for JetBrains |

## Trigger

The CLI emits a system notification. The specific notification type is identified by the `notification_type` field in the input.

## Matcher

The `matcher` field applies to `notification_type`. The value is an anchored regex: `^(?:<pattern>)$`. Only notifications whose type matches the pattern will trigger this hook instance.

### `notification_type` values

| Value | When it fires |
|---|---|
| `shell_completed` | A shell command that was running finishes |
| `shell_detached_completed` | A detached/background shell command finishes |
| `agent_completed` | The agent completes a full response turn |
| `agent_idle` | The agent has been idle and is waiting for input |
| `permission_prompt` | The CLI is about to show a permission prompt to the user |
| `elicitation_dialog` | The CLI shows an elicitation dialog requesting user input |

### Matcher examples

```json
"matcher": "shell_completed|shell_detached_completed"
```
Fires only when shell commands finish.

```json
"matcher": "agent_completed"
```
Fires only when the agent completes a turn.

```json
"matcher": "permission_prompt"
```
Fires when a permission prompt is about to appear.

## Input Shape

This hook uses a mixed-case format: the input contains both camelCase session fields and snake_case notification-specific fields.

```json
{
  "sessionId": "string",
  "timestamp": 1716470400000,
  "cwd": "/path/to/workspace",
  "hook_event_name": "Notification",
  "message": "string — the notification message text",
  "title": "optional string — the notification title",
  "notification_type": "shell_completed | shell_detached_completed | agent_completed | agent_idle | permission_prompt | elicitation_dialog"
}
```

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Unique identifier for this session |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `cwd` | `string` | Working directory at notification time |
| `hook_event_name` | `"Notification"` | Fixed discriminator value |
| `message` | `string` | The notification message text |
| `title` | `string?` | The notification title, if present |
| `notification_type` | `string` | The category of notification (see table above) |

## Output Shape

### CLI (stdout JSON)

```json
{
  "additionalContext": "string — injected as a user message into the session"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `additionalContext` | `string` | No | Injected as a user-side message into the current session |

## Exit Codes

| Exit Code | Behavior |
|---|---|
| `0` | Success; stdout parsed as JSON if present |
| `2` | Warning logged; execution continues (fail-open) |
| Other non-zero | Logged as failure; execution continues (fail-open) |

## Effects

- `additionalContext`: when returned, the string is injected as a user message into the live session. The agent receives this as if the user typed it. This can trigger a new agent turn.
- Side effects: use this hook to trigger OS-level notifications, sound alerts, or external messages when CLI events occur.

## Special Notes

### CLI-only hook

`notification` does not fire in the Cloud Agent, VS Code, or JetBrains. It is specific to the interactive CLI experience.

### Mixed-case input format

Unlike most hooks, the `notification` input mixes camelCase session fields (`sessionId`, `timestamp`, `cwd`) with snake_case notification fields (`hook_event_name`, `notification_type`). This is intentional and reflects the CLI's internal format.

### `additionalContext` injects a user message

When `additionalContext` is returned, it is injected into the session as if the user sent a message. This can trigger the agent to respond — use it carefully to avoid unwanted interruptions.

### Practical use: OS notifications

A common use of this hook is forwarding CLI notifications to the operating system's native notification system (e.g., `osascript` on macOS, `notify-send` on Linux, `msg` or PowerShell toast on Windows). This lets users leave the terminal and be alerted when the agent finishes.

### `permission_prompt` vs `permissionRequest`

`notification` with `notification_type: "permission_prompt"` fires when the CLI is about to display a permission UI to the user. `permissionRequest` (a separate hook) fires before the permission service logic runs and can programmatically allow or deny the tool. They serve different purposes.

## Config Example

### macOS notification on agent completion

```json
{
  "version": 1,
  "hooks": {
    "notification": [
      {
        "type": "command",
        "bash": "osascript -e \"display notification \\\"$MESSAGE\\\" with title \\\"Copilot\\\"\"",
        "matcher": "agent_completed",
        "env": {
          "MESSAGE": "{{message}}"
        },
        "timeoutSec": 5
      }
    ]
  }
}
```

### Linux notification on shell command completion

```json
{
  "version": 1,
  "hooks": {
    "notification": [
      {
        "type": "command",
        "bash": "notify-send 'Copilot' \"$MESSAGE\"",
        "matcher": "shell_completed|shell_detached_completed",
        "env": {
          "MESSAGE": "{{message}}"
        },
        "timeoutSec": 5
      }
    ]
  }
}
```

### Inject context when agent goes idle

```json
{
  "version": 1,
  "hooks": {
    "notification": [
      {
        "type": "command",
        "bash": "echo '{\"additionalContext\": \"The agent has been idle for a while. If you need anything, type your next instruction.\"}'",
        "matcher": "agent_idle",
        "timeoutSec": 5
      }
    ]
  }
}
```

### Windows PowerShell toast notification

```json
{
  "version": 1,
  "hooks": {
    "notification": [
      {
        "type": "command",
        "powershell": "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText01); $template.GetElementsByTagName('text')[0].AppendChild($template.CreateTextNode($env:MESSAGE)) > $null; $toast = [Windows.UI.Notifications.ToastNotification]::new($template); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Copilot').Show($toast)",
        "matcher": "agent_completed",
        "env": {
          "MESSAGE": "{{message}}"
        },
        "timeoutSec": 10
      }
    ]
  }
}
```
