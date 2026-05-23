# postToolUseFailure

## Overview

Fires after a tool call fails (non-zero exit or execution error). Use it to log failures, send alerts, or inject diagnostic context into the LLM's view. Exit code 2 from this hook causes its stdout to be injected as `additionalContext`.

## Surfaces

| Surface | Supported | Notes |
|---|---|---|
| CLI | Yes | Exit code 2 enables additionalContext injection |
| Cloud Agent | Yes | Same behavior as CLI |
| VS Code | Yes | Event name is `PostToolUseFailure` (PascalCase) |
| JetBrains | Yes | |

## Trigger

After a tool call fails. A failure is defined as the tool returning a non-zero exit code or throwing an execution error. Does not fire on successful tool completions — see `postToolUse` for that case.

## Matcher

None. The matcher field has no effect on this hook.

## Input Shape

### CLI / Cloud Agent (camelCase)

```json
{
  "sessionId": "string",
  "timestamp": 1716470400000,
  "cwd": "/path/to/workspace",
  "toolName": "bash",
  "toolArgs": {
    "command": "cat /nonexistent-file"
  },
  "error": "cat: /nonexistent-file: No such file or directory"
}
```

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Unique identifier for this session |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `cwd` | `string` | Working directory at invocation time |
| `toolName` | `string` | Name of the tool that failed |
| `toolArgs` | `object` | Arguments that were passed to the tool |
| `error` | `string` | The error message produced by the tool failure |

### VS Code (snake_case)

```json
{
  "hook_event_name": "PostToolUseFailure",
  "session_id": "string",
  "timestamp": "2026-05-23T00:00:00.000Z",
  "cwd": "/path/to/workspace",
  "tool_name": "bash",
  "tool_input": {
    "command": "cat /nonexistent-file"
  },
  "error": "cat: /nonexistent-file: No such file or directory"
}
```

| Field | Type | Description |
|---|---|---|
| `hook_event_name` | `"PostToolUseFailure"` | Fixed discriminator value |
| `session_id` | `string` | Unique identifier for this session |
| `timestamp` | `string` | ISO 8601 timestamp |
| `cwd` | `string` | Working directory at invocation time |
| `tool_name` | `string` | Name of the tool that failed |
| `tool_input` | `object` | Arguments that were passed to the tool |
| `error` | `string` | The error message produced by the tool failure |

## Output Shape

The output mechanism for this hook is exit-code driven rather than JSON-field driven.

| Condition | Effect |
|---|---|
| Exit code `2` | stdout is treated as `additionalContext` and injected into the LLM's view of the failure |
| Exit code `0` | stdout is ignored |
| Other non-zero | Logged as failure; execution continues |

There is no structured JSON output format. When you want to inject context, write plain text (or any string) to stdout and exit with code 2.

## Exit Codes

### CLI / Cloud Agent

| Exit Code | Behavior |
|---|---|
| `0` | Success; stdout is ignored |
| `2` | stdout is used as `additionalContext` injected into the LLM's view of the tool failure |
| Other non-zero | Logged as failure; execution continues (fail-open) |

### VS Code

| Exit Code | Behavior |
|---|---|
| `0` | Success |
| `2` | Blocking error; shown to model |
| Other non-zero | Non-blocking warning; shown to user |

## Effects

- Context injection via exit code 2: write diagnostic information to stdout and exit 2 to give the LLM additional context about why the tool failed and how to recover.
- Logging: write failure events to an external log or monitoring system.
- Alerting: send a notification when a specific tool fails.

## Special Notes

### Exit code 2 is the signal — not JSON

Unlike most hooks, `postToolUseFailure` does not parse structured JSON output from stdout. The mechanism is: exit with code 2, and stdout (whatever its format) becomes `additionalContext`. If you exit 0, stdout is discarded regardless of content.

### Use cases for additionalContext injection

When the agent's tool fails, it may not understand why. By exiting with code 2 and printing diagnostic information — stack traces, environment state, known workarounds — you can steer the agent toward a recovery path without requiring a separate turn.

### Cannot prevent or undo the failure

The tool has already failed by the time this hook fires. This hook cannot retry the tool, alter the failure result, or block further execution. It can only observe and optionally annotate.

### Distinguish from `errorOccurred`

`postToolUseFailure` fires specifically when a tool call fails. `errorOccurred` fires for any error during agent execution, including model errors, system errors, and user input errors. For tool-specific failure handling, use `postToolUseFailure`.

## Config Example

### Inject diagnostic context on bash failure

```bash
#!/usr/bin/env bash
# scripts/diagnose-bash-failure.sh
# Receives postToolUseFailure JSON on stdin

ERROR=$(jq -r '.error' -)
echo "The command failed with: $ERROR"
echo "Check that required dependencies are installed and that the working directory is correct."
exit 2  # exit 2 causes stdout to be injected as additionalContext
```

```json
{
  "version": 1,
  "hooks": {
    "postToolUseFailure": [
      {
        "type": "command",
        "bash": "./scripts/diagnose-bash-failure.sh",
        "timeoutSec": 10
      }
    ]
  }
}
```

### Alert on any tool failure

```json
{
  "version": 1,
  "hooks": {
    "postToolUseFailure": [
      {
        "type": "command",
        "bash": "curl -s -X POST https://alerts.example.com/copilot-tool-failure -H 'Content-Type: application/json' -d @-",
        "timeoutSec": 10
      }
    ]
  }
}
```

### VS Code (`.github/hooks/post-tool-failure.json`)

```json
{
  "version": 1,
  "hooks": {
    "PostToolUseFailure": [
      {
        "type": "command",
        "command": "node ./scripts/handle-tool-failure.js",
        "timeout": 10
      }
    ]
  }
}
```
