# agentStop

## Overview

Fires when the main agent finishes responding to a prompt (end of a turn). Can force an additional turn by returning `"block"` with a reason. Use it to run post-turn validation, enforce completion criteria, or inject follow-up instructions automatically.

## Surfaces

| Surface | Supported | Notes |
|---|---|---|
| CLI | Yes | `"block"` forces an interactive follow-up turn |
| Cloud Agent | Yes | `"block"` causes the agent to continue with `reason` as the next instruction |
| VS Code | Yes | Event name is `Stop` (PascalCase); uses `hookSpecificOutput` wrapper |
| JetBrains | Yes | |

## Trigger

The main agent completes its response to a prompt and reaches `stopReason: "end_turn"`. Fires once per agent turn, not once per session.

## Matcher

None. The matcher field has no effect on this hook.

## Input Shape

### CLI / Cloud Agent (camelCase)

```json
{
  "sessionId": "string",
  "timestamp": 1716470400000,
  "cwd": "/path/to/workspace",
  "transcriptPath": "/path/to/transcript.json",
  "stopReason": "end_turn"
}
```

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Unique identifier for this session |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `cwd` | `string` | Working directory at stop time |
| `transcriptPath` | `string` | Absolute path to the full conversation transcript file |
| `stopReason` | `"end_turn"` | Always `"end_turn"` in current implementations |

### VS Code (snake_case)

```json
{
  "hook_event_name": "Stop",
  "session_id": "string",
  "timestamp": "2026-05-23T00:00:00.000Z",
  "cwd": "/path/to/workspace",
  "transcript_path": "/path/to/transcript.json",
  "stop_reason": "end_turn"
}
```

| Field | Type | Description |
|---|---|---|
| `hook_event_name` | `"Stop"` | Fixed discriminator value |
| `session_id` | `string` | Unique identifier for this session |
| `timestamp` | `string` | ISO 8601 timestamp |
| `cwd` | `string` | Working directory at stop time |
| `transcript_path` | `string` | Absolute path to the full conversation transcript file |
| `stop_reason` | `"end_turn"` | Always `"end_turn"` in current implementations |

## Output Shape

### CLI / Cloud Agent (stdout JSON)

```json
{
  "decision": "block | allow",
  "reason": "string — becomes the next agent prompt when decision is block"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `decision` | `"block" \| "allow"` | No | Whether to force another agent turn |
| `reason` | `string` | When `"block"` | The instruction or prompt injected as the next agent turn |

### VS Code (`hookSpecificOutput` wrapper)

```json
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "decision": "block",
    "reason": "string"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `hookSpecificOutput.hookEventName` | `"Stop"` | Fixed discriminator |
| `hookSpecificOutput.decision` | `"block"?` | Present only when blocking |
| `hookSpecificOutput.reason` | `string?` | The instruction injected as the next turn |

## Exit Codes

### CLI / Cloud Agent

| Exit Code | Behavior |
|---|---|
| `0` | Success; stdout parsed as JSON if present; no JSON = `"allow"` |
| `2` | Warning logged; execution continues (fail-open) |
| Other non-zero | Logged as failure; execution continues (fail-open) |

### VS Code

| Exit Code | Behavior |
|---|---|
| `0` | Success; stdout parsed as JSON |
| `2` | Blocking error; shown to model |
| Other non-zero | Non-blocking warning; shown to user |

## Effects

- `"block"` + `reason`: forces another agent turn. The `reason` string is injected as a new user-side message and the agent runs again with that as its next prompt.
- `"allow"` or no output: the session ends normally (or returns to interactive waiting in the CLI).
- Transcript access: the `transcriptPath` field lets the hook read the full conversation history before deciding whether to continue.

## Special Notes

### `"block"` creates a new turn, not a system message

When `"block"` is returned, the `reason` is submitted as the next prompt — it is treated the same as if the user typed it. This means the agent will process it through its full reasoning pipeline, including any `preToolUse` hooks on subsequent tool calls.

### Preventing infinite loops

If a `agentStop` hook always returns `"block"`, the agent will run indefinitely. Always include a termination condition — check the transcript, a turn counter, or an external state file before deciding to block.

### Cloud Agent behavior

In the Cloud Agent, `"block"` causes the agent to continue processing with `reason` as the next instruction. This allows post-completion validation hooks that push the agent to complete additional steps if the output does not meet criteria.

### Transcript path

The transcript file at `transcriptPath` contains the full conversation history in JSON format. Hooks can read this file to inspect the agent's responses, tool calls, and tool results before deciding whether to force another turn.

### `stopReason` is always `"end_turn"`

In current implementations, `stopReason` is always `"end_turn"`. Future versions may introduce additional stop reasons.

## Config Example

### Enforce that a test file was created after coding

```bash
#!/usr/bin/env bash
# scripts/check-tests-written.sh

TRANSCRIPT=$(cat "$TRANSCRIPT_PATH")
HAS_TEST=$(echo "$TRANSCRIPT" | jq '[.[] | select(.role == "tool" and (.name == "create") and (.input.file_path | test("test|spec")))] | length')

if [ "$HAS_TEST" = "0" ]; then
  echo '{"decision": "block", "reason": "You have not written any test files. Please write tests for the code you just created."}'
fi
exit 0
```

```json
{
  "version": 1,
  "hooks": {
    "agentStop": [
      {
        "type": "command",
        "bash": "./scripts/check-tests-written.sh",
        "env": {
          "TRANSCRIPT_PATH": "{{transcriptPath}}"
        },
        "timeoutSec": 15
      }
    ]
  }
}
```

### Run linter and force fix if it fails

```json
{
  "version": 1,
  "hooks": {
    "agentStop": [
      {
        "type": "command",
        "bash": "pnpm lint > /tmp/lint-output.txt 2>&1 && echo '{\"decision\": \"allow\"}' || echo \"{\\\"decision\\\": \\\"block\\\", \\\"reason\\\": \\\"Linting failed. Fix all lint errors before finishing: $(cat /tmp/lint-output.txt)\\\"}\"",
        "timeoutSec": 30
      }
    ]
  }
}
```

### VS Code (`.github/hooks/agent-stop.json`)

```json
{
  "version": 1,
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "node ./scripts/post-turn-check.js",
        "timeout": 20
      }
    ]
  }
}
```
