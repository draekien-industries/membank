# errorOccurred

## Overview

Fires whenever an error occurs during agent execution. Use it for centralized error logging, alerting, and diagnostics. Cannot alter agent behavior — observation only.

## Surfaces

| Surface | Supported | Notes |
|---|---|---|
| CLI | Yes | Fires for all error contexts |
| Cloud Agent | Yes | Fires for all error contexts |
| VS Code | Yes | Event name is `ErrorOccurred` (PascalCase) |
| JetBrains | Yes | |

## Trigger

Any error during agent execution. This includes model call errors, tool execution errors, system-level errors, and user input errors.

## Matcher

None. The matcher field has no effect on this hook.

## Input Shape

### CLI / Cloud Agent (camelCase)

```json
{
  "sessionId": "string",
  "timestamp": 1716470400000,
  "cwd": "/path/to/workspace",
  "error": {
    "message": "string — human-readable error description",
    "name": "string — error class or type name",
    "stack": "optional string — stack trace"
  },
  "errorContext": "model_call | tool_execution | system | user_input",
  "recoverable": true
}
```

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Unique identifier for this session |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `cwd` | `string` | Working directory at the time of the error |
| `error.message` | `string` | Human-readable error description |
| `error.name` | `string` | Error class or type name (e.g., `"TypeError"`, `"NetworkError"`) |
| `error.stack` | `string?` | Stack trace, if available |
| `errorContext` | `"model_call" \| "tool_execution" \| "system" \| "user_input"` | The category of error |
| `recoverable` | `boolean` | Whether the agent can continue execution after this error |

### VS Code (snake_case)

```json
{
  "hook_event_name": "ErrorOccurred",
  "session_id": "string",
  "timestamp": "2026-05-23T00:00:00.000Z",
  "cwd": "/path/to/workspace",
  "error": {
    "message": "string",
    "name": "string",
    "stack": "optional string"
  },
  "error_context": "model_call | tool_execution | system | user_input",
  "recoverable": true
}
```

| Field | Type | Description |
|---|---|---|
| `hook_event_name` | `"ErrorOccurred"` | Fixed discriminator value |
| `session_id` | `string` | Unique identifier for this session |
| `timestamp` | `string` | ISO 8601 timestamp |
| `cwd` | `string` | Working directory at the time of the error |
| `error.message` | `string` | Human-readable error description |
| `error.name` | `string` | Error class or type name |
| `error.stack` | `string?` | Stack trace, if available |
| `error_context` | `"model_call" \| "tool_execution" \| "system" \| "user_input"` | The category of error |
| `recoverable` | `boolean` | Whether the agent can continue execution after this error |

### `errorContext` values

| Value | Meaning |
|---|---|
| `model_call` | Error occurred during an API call to the underlying model |
| `tool_execution` | Error occurred while executing a tool (distinct from a tool returning a failure result) |
| `system` | Internal system-level error |
| `user_input` | Error caused by invalid or unexpected user input |

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

- Writing structured error records to a log file or database
- Sending error alerts to Slack, PagerDuty, or other channels
- Emitting metrics on error frequency, context, and recoverability
- Capturing stack traces for later analysis
- Differentiating between recoverable and unrecoverable errors for alerting severity

## Special Notes

### Distinction from `postToolUseFailure`

`errorOccurred` fires for any error anywhere in agent execution, including model API failures, system errors, and user input errors. `postToolUseFailure` fires specifically when a tool call returns a failure result. Both may fire for tool-related errors depending on the failure mode:

- Tool returns non-zero exit: `postToolUseFailure` fires
- Tool cannot be invoked at all (system error): `errorOccurred` with `errorContext: "tool_execution"` may fire

### `recoverable` field

When `recoverable` is `false`, the session typically ends shortly after this hook fires (triggering `sessionEnd` with `reason: "error"`). Use this field to differentiate alert severity — unrecoverable errors warrant immediate attention; recoverable ones may only require logging.

### Stack trace availability

The `error.stack` field is optional. It is present when the runtime captures a JavaScript/Node.js style stack trace. For model API errors or user input errors it may be absent.

### Hook itself is fail-open

If the `errorOccurred` hook itself fails (e.g., the logging service is unreachable), execution continues. The hook failure is logged, but it does not compound the original error.

## Config Example

### Log errors to a file

```json
{
  "version": 1,
  "hooks": {
    "errorOccurred": [
      {
        "type": "command",
        "bash": "jq -c '{ts: .timestamp, context: .errorContext, recoverable: .recoverable, message: .error.message}' >> ~/.copilot/errors.ndjson",
        "timeoutSec": 5
      }
    ]
  }
}
```

### Alert on unrecoverable errors

```bash
#!/usr/bin/env bash
# scripts/alert-on-fatal-error.sh

INPUT=$(cat -)
RECOVERABLE=$(echo "$INPUT" | jq -r '.recoverable')

if [ "$RECOVERABLE" = "false" ]; then
  MESSAGE=$(echo "$INPUT" | jq -r '.error.message')
  curl -s -X POST https://alerts.example.com/copilot-fatal \
    -H 'Content-Type: application/json' \
    -d "{\"text\": \"Fatal Copilot error: $MESSAGE\"}"
fi
exit 0
```

```json
{
  "version": 1,
  "hooks": {
    "errorOccurred": [
      {
        "type": "command",
        "bash": "./scripts/alert-on-fatal-error.sh",
        "timeoutSec": 10
      }
    ]
  }
}
```

### HTTP error reporting endpoint

```json
{
  "version": 1,
  "hooks": {
    "errorOccurred": [
      {
        "type": "http",
        "url": "https://telemetry.example.com/copilot/errors",
        "headers": {
          "X-Source": "copilot-cli"
        },
        "timeoutSec": 10
      }
    ]
  }
}
```

### VS Code (`.github/hooks/error-occurred.json`)

```json
{
  "version": 1,
  "hooks": {
    "ErrorOccurred": [
      {
        "type": "command",
        "command": "node ./scripts/log-error.js",
        "timeout": 10
      }
    ]
  }
}
```
