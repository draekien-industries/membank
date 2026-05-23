# sessionEnd

## Overview

Fires when a session terminates for any reason. Use it for cleanup, telemetry flushing, reporting, or sending completion notifications.

## Surfaces

| Surface | Supported | Notes |
|---|---|---|
| CLI | Yes | All termination types |
| Cloud Agent | Yes | Fires once per job at job completion |
| VS Code | Yes | Event name is `SessionEnd` (PascalCase) |
| JetBrains | Yes | |

## Trigger

The Copilot session ends. This includes normal completion, user exit, error termination, timeout, and abort.

## Matcher

None. The matcher field has no effect on this hook.

## Input Shape

### CLI / Cloud Agent (camelCase)

```json
{
  "sessionId": "string",
  "timestamp": 1716470400000,
  "cwd": "/path/to/workspace",
  "reason": "complete | error | abort | timeout | user_exit"
}
```

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Unique identifier for this session |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `cwd` | `string` | Working directory at the time the session ended |
| `reason` | `"complete" \| "error" \| "abort" \| "timeout" \| "user_exit"` | Why the session ended |

### VS Code (snake_case)

```json
{
  "hook_event_name": "SessionEnd",
  "session_id": "string",
  "timestamp": "2026-05-23T00:00:00.000Z",
  "cwd": "/path/to/workspace",
  "reason": "complete | error | abort | timeout | user_exit"
}
```

| Field | Type | Description |
|---|---|---|
| `hook_event_name` | `"SessionEnd"` | Fixed discriminator value |
| `session_id` | `string` | Unique identifier for this session |
| `timestamp` | `string` | ISO 8601 timestamp |
| `cwd` | `string` | Working directory at the time the session ended |
| `reason` | `"complete" \| "error" \| "abort" \| "timeout" \| "user_exit"` | Why the session ended |

### `reason` values

| Value | Meaning |
|---|---|
| `complete` | Session finished normally after the agent completed its response |
| `error` | Session terminated due to an unrecoverable error |
| `abort` | Session was programmatically aborted |
| `timeout` | Session exceeded a time limit |
| `user_exit` | User explicitly exited the CLI or closed the interface |

## Output Shape

No structured output is processed. This hook is side-effect only. Any stdout is ignored.

## Exit Codes

| Exit Code | Behavior |
|---|---|
| `0` | Success; stdout is ignored |
| `2` | Warning logged; execution continues |
| Other non-zero | Logged as failure; execution continues (fail-open) |

VS Code exit code semantics:

| Exit Code | Behavior |
|---|---|
| `0` | Success |
| `2` | Blocking error; shown to model |
| Other non-zero | Non-blocking warning; shown to user |

## Effects

No output fields alter agent behavior. Use this hook for:

- Flushing telemetry or metrics to a backend
- Writing session summary records (duration, reason, session ID)
- Sending a Slack or webhook notification on session completion or failure
- Cleaning up temporary files or lock files created at session start
- Differentiating between clean exits and error/abort exits via `reason`

## Special Notes

### Execution guarantee

`sessionEnd` runs regardless of how the session ends, including on error. It should be treated as a best-effort cleanup mechanism — the hook itself can fail (non-zero exit) and execution does not retry.

### Cloud Agent behavior

In the Cloud Agent, this fires once per job when the job finishes. Because the Cloud Agent does not support session resumption, `reason` will typically be `"complete"` or `"error"`.

### Hook timeout

The hook has a default timeout of 30 seconds (`timeoutSec`). If the cleanup script takes longer, it is terminated and logged as a failure. Set `timeoutSec` explicitly for longer operations.

## Config Example

### CLI / Cloud Agent (`config.json`)

```json
{
  "version": 1,
  "hooks": {
    "sessionEnd": [
      {
        "type": "command",
        "bash": "node ./scripts/report-session.js",
        "timeoutSec": 15
      }
    ]
  }
}
```

### Differentiated by exit reason (bash)

```json
{
  "version": 1,
  "hooks": {
    "sessionEnd": [
      {
        "type": "command",
        "bash": "if [ \"$REASON\" = 'error' ]; then curl -s -X POST https://alerts.example.com/copilot-error -d \"{}\"; fi",
        "env": {
          "REASON": "{{reason}}"
        },
        "timeoutSec": 10
      }
    ]
  }
}
```

### VS Code (`.github/hooks/session-end.json`)

```json
{
  "version": 1,
  "hooks": {
    "SessionEnd": [
      {
        "type": "command",
        "command": "node ./scripts/session-cleanup.js",
        "timeout": 15
      }
    ]
  }
}
```
