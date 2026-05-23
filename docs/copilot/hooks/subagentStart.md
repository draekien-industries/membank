# subagentStart

## Overview

Fires immediately before a subagent is spawned via the `task` tool. Use it to inject additional context or instructions into the subagent's initial prompt, or to log which subagents are being created.

## Surfaces

| Surface | Supported | Notes |
|---|---|---|
| CLI | Yes | `additionalContext` prepended to subagent's initial prompt |
| Cloud Agent | Yes | Same behavior as CLI |
| VS Code | Yes | Event name is `SubagentStart` (PascalCase) |
| JetBrains | Yes | |

## Trigger

Immediately before the `task` tool spawns a subagent. Fires once per subagent creation.

## Matcher

The `matcher` field applies to `agentName`. The value is an anchored regex: `^(?:<pattern>)$`. Only subagent spawns whose name matches the pattern will trigger this hook instance.

### Matcher example

```json
"matcher": "code-reviewer"
```
Matches only subagents named `code-reviewer`.

```json
"matcher": ".*"
```
Matches all subagents.

## Input Shape

### CLI / Cloud Agent (camelCase only — no snake_case variant documented)

```json
{
  "sessionId": "string",
  "timestamp": 1716470400000,
  "cwd": "/path/to/workspace",
  "transcriptPath": "/path/to/transcript.json",
  "agentName": "string",
  "agentDisplayName": "optional string",
  "agentDescription": "optional string"
}
```

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Unique identifier for the parent session |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `cwd` | `string` | Working directory at spawn time |
| `transcriptPath` | `string` | Absolute path to the parent agent's transcript |
| `agentName` | `string` | Internal name of the subagent being spawned |
| `agentDisplayName` | `string?` | Human-readable display name of the subagent, if defined |
| `agentDescription` | `string?` | Description of the subagent's purpose, if defined |

No snake_case variant is documented for this hook. Only camelCase input is provided.

## Output Shape

### CLI / Cloud Agent (stdout JSON)

```json
{
  "additionalContext": "string — prepended to the subagent's initial prompt"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `additionalContext` | `string` | No | Text prepended to the subagent's initial prompt before it starts |

## Exit Codes

### CLI / Cloud Agent

| Exit Code | Behavior |
|---|---|
| `0` | Success; stdout parsed as JSON if present |
| `2` | Warning logged; execution continues (fail-open) |
| Other non-zero | Logged as failure; execution continues (fail-open) |

### VS Code

| Exit Code | Behavior |
|---|---|
| `0` | Success; stdout parsed as JSON |
| `2` | Blocking error; shown to model |
| Other non-zero | Non-blocking warning; shown to user |

## Effects

- `additionalContext`: prepended to the subagent's initial prompt. The subagent starts with this content as additional context before its task description.
- No blocking: this hook cannot prevent a subagent from being spawned.

## Special Notes

### Context prepend order

`additionalContext` is prepended to the beginning of the subagent's prompt, not appended. The subagent sees your injected context before the task description.

### No snake_case variant

Unlike most other hooks, no snake_case (VS Code) input format is documented for `subagentStart`. The camelCase format is the canonical input regardless of surface.

### Matcher on `agentName`

The matcher regex applies to `agentName`, not `toolName`. This is the only hook where the matcher targets agent identity rather than tool name.

### Use with agent definitions

Subagent names correspond to agent definitions in `.agent.md` files or programmatically defined agents. The `agentName` field contains the identifier used when the `task` tool is called.

### Relationship to `subagentStop`

`subagentStart` fires before the subagent runs; `subagentStop` fires after it completes. Together they bookend a subagent's lifecycle. `subagentStart` is the injection point; `subagentStop` is the validation or post-processing point.

## Config Example

### Inject project constraints into every subagent

```json
{
  "version": 1,
  "hooks": {
    "subagentStart": [
      {
        "type": "command",
        "bash": "echo '{\"additionalContext\": \"You are operating in a production repository. Do not delete files, do not modify package.json, and always run tests before considering a task complete.\"}'",
        "timeoutSec": 5
      }
    ]
  }
}
```

### Inject context for a specific named subagent

```json
{
  "version": 1,
  "hooks": {
    "subagentStart": [
      {
        "type": "command",
        "bash": "node ./scripts/inject-reviewer-context.js",
        "matcher": "code-reviewer",
        "timeoutSec": 10
      }
    ]
  }
}
```

### Load context from a file

```bash
#!/usr/bin/env bash
# scripts/inject-subagent-context.sh

CONTEXT=$(cat .copilot/subagent-constraints.txt)
echo "{\"additionalContext\": \"$CONTEXT\"}"
exit 0
```

```json
{
  "version": 1,
  "hooks": {
    "subagentStart": [
      {
        "type": "command",
        "bash": "./scripts/inject-subagent-context.sh",
        "timeoutSec": 5
      }
    ]
  }
}
```

### VS Code (`.github/hooks/subagent-start.json`)

```json
{
  "version": 1,
  "hooks": {
    "SubagentStart": [
      {
        "type": "command",
        "command": "node ./scripts/setup-subagent.js",
        "timeout": 10
      }
    ]
  }
}
```
