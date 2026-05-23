# subagentStop

## Overview

Fires when a subagent completes, before its results are returned to the parent agent. Can force the subagent to run another turn by returning `"block"`. Use it to validate subagent output, enforce completion criteria, or log subagent results.

## Surfaces

| Surface | Supported | Notes |
|---|---|---|
| CLI | Yes | `"block"` forces another subagent turn |
| Cloud Agent | Yes | Same behavior as CLI |
| VS Code | Yes | Event name is `SubagentStop` (PascalCase) |
| JetBrains | Yes | |

## Trigger

A subagent (spawned via the `task` tool) completes its response and reaches `stopReason: "end_turn"`. Fires once per subagent turn completion, before the result is handed back to the parent agent.

## Matcher

None. The matcher field has no effect on this hook.

## Input Shape

### CLI / Cloud Agent (camelCase)

```json
{
  "sessionId": "string",
  "timestamp": 1716470400000,
  "cwd": "/path/to/workspace",
  "transcriptPath": "/path/to/subagent-transcript.json",
  "agentName": "string",
  "agentDisplayName": "optional string",
  "stopReason": "end_turn"
}
```

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Unique identifier for the parent session |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `cwd` | `string` | Working directory at stop time |
| `transcriptPath` | `string` | Absolute path to the subagent's transcript |
| `agentName` | `string` | Internal name of the subagent that completed |
| `agentDisplayName` | `string?` | Human-readable display name of the subagent |
| `stopReason` | `"end_turn"` | Always `"end_turn"` in current implementations |

### VS Code (snake_case)

```json
{
  "hook_event_name": "SubagentStop",
  "session_id": "string",
  "timestamp": "2026-05-23T00:00:00.000Z",
  "cwd": "/path/to/workspace",
  "transcript_path": "/path/to/subagent-transcript.json",
  "agent_name": "string",
  "agent_display_name": "optional string",
  "stop_reason": "end_turn"
}
```

| Field | Type | Description |
|---|---|---|
| `hook_event_name` | `"SubagentStop"` | Fixed discriminator value |
| `session_id` | `string` | Unique identifier for the parent session |
| `timestamp` | `string` | ISO 8601 timestamp |
| `cwd` | `string` | Working directory at stop time |
| `transcript_path` | `string` | Absolute path to the subagent's transcript |
| `agent_name` | `string` | Internal name of the subagent that completed |
| `agent_display_name` | `string?` | Human-readable display name of the subagent |
| `stop_reason` | `"end_turn"` | Always `"end_turn"` in current implementations |

## Output Shape

### CLI / Cloud Agent (stdout JSON)

```json
{
  "decision": "block | allow",
  "reason": "string — injected as the next instruction when decision is block"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `decision` | `"block" \| "allow"` | No | Whether to force another subagent turn |
| `reason` | `string` | When `"block"` | The instruction injected as the subagent's next prompt |

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

- `"block"` + `reason`: forces the subagent to run another turn with `reason` as its next prompt, before results are returned to the parent.
- `"allow"` or no output: the subagent's results are returned to the parent agent normally.
- Transcript access: `transcriptPath` points to the subagent's own transcript, which can be inspected to validate output quality before allowing it to propagate.

## Special Notes

### Fires before parent receives results

`subagentStop` fires in the gap between the subagent completing and the parent agent receiving the result. A `"block"` decision keeps the subagent running and delays the parent — the parent does not see partial results.

### Preventing infinite loops

If a hook always returns `"block"`, the subagent will run indefinitely. Always include a termination condition. Read the `transcriptPath` and check for specific output, a tool call, or a turn count before blocking again.

### `transcriptPath` is the subagent's transcript

Unlike `agentStop`, where `transcriptPath` is the main session's transcript, here `transcriptPath` points to the subagent's own transcript. This allows evaluating only the subagent's output.

### Relationship to `agentStop`

`agentStop` fires for the main agent; `subagentStop` fires for subagents spawned via `task`. Both support the same `"block"` / `"allow"` decision mechanism. They fire independently.

### `stopReason` is always `"end_turn"`

In current implementations, `stopReason` is always `"end_turn"`. Additional stop reasons may be introduced in future versions.

## Config Example

### Require a summary in the subagent's output before allowing it to finish

```bash
#!/usr/bin/env bash
# scripts/validate-subagent-output.sh

TRANSCRIPT_PATH="$1"
HAS_SUMMARY=$(jq '[.[] | select(.role == "assistant") | .content | strings | test("## Summary")] | any' "$TRANSCRIPT_PATH")

if [ "$HAS_SUMMARY" != "true" ]; then
  echo '{"decision": "block", "reason": "Your response must include a ## Summary section at the end. Please add one."}'
fi
exit 0
```

```json
{
  "version": 1,
  "hooks": {
    "subagentStop": [
      {
        "type": "command",
        "bash": "./scripts/validate-subagent-output.sh \"{{transcriptPath}}\"",
        "timeoutSec": 10
      }
    ]
  }
}
```

### Log subagent completion with name and session

```json
{
  "version": 1,
  "hooks": {
    "subagentStop": [
      {
        "type": "command",
        "bash": "jq -c '{ts: .timestamp, agent: .agentName, reason: .stopReason}' >> ~/.copilot/subagent-log.ndjson",
        "timeoutSec": 5
      }
    ]
  }
}
```

### VS Code (`.github/hooks/subagent-stop.json`)

```json
{
  "version": 1,
  "hooks": {
    "SubagentStop": [
      {
        "type": "command",
        "command": "node ./scripts/validate-subagent.js",
        "timeout": 15
      }
    ]
  }
}
```
