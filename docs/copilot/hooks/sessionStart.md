# sessionStart

## Overview

Fires when a new session begins or an existing session is resumed. Use it for environment setup, audit logging, loading context, or injecting an initial prompt (CLI only).

## Surfaces

| Surface | Supported | Notes |
|---|---|---|
| CLI | Yes | All session types: startup, resume, new |
| Cloud Agent | Yes | `source` is always `"new"`; resume is not a concept |
| VS Code | Yes | Event name is `SessionStart` (PascalCase) |
| JetBrains | Yes | |

## Trigger

A new or resumed Copilot session starts. In the Cloud Agent, fires once per job at job start.

## Matcher

None. The matcher field has no effect on this hook.

## Input Shape

### CLI / Cloud Agent (camelCase)

```json
{
  "sessionId": "string",
  "timestamp": 1716470400000,
  "cwd": "/path/to/workspace",
  "source": "startup | resume | new",
  "initialPrompt": "optional string — the first user prompt, if available"
}
```

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Unique identifier for this session |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `cwd` | `string` | Working directory at session start |
| `source` | `"startup" \| "resume" \| "new"` | How the session was initiated |
| `initialPrompt` | `string?` | The first prompt submitted by the user, if present at startup |

### VS Code (snake_case)

```json
{
  "hook_event_name": "SessionStart",
  "session_id": "string",
  "timestamp": "2026-05-23T00:00:00.000Z",
  "cwd": "/path/to/workspace",
  "source": "startup | resume | new",
  "initial_prompt": "optional string"
}
```

| Field | Type | Description |
|---|---|---|
| `hook_event_name` | `"SessionStart"` | Fixed discriminator value |
| `session_id` | `string` | Unique identifier for this session |
| `timestamp` | `string` | ISO 8601 timestamp |
| `cwd` | `string` | Working directory at session start |
| `source` | `"startup" \| "resume" \| "new"` | How the session was initiated |
| `initial_prompt` | `string?` | The first prompt submitted by the user, if present |

## Output Shape

No structured output is processed. This hook is side-effect only.

For `"type": "prompt"` handlers (CLI only, see below), the output is the prompt string itself, not JSON.

## Exit Codes

| Exit Code | Behavior |
|---|---|
| `0` | Success; stdout is ignored |
| `2` | Warning logged; execution continues |
| Other non-zero | Logged as failure; execution continues (fail-open) |

VS Code exit code semantics differ:

| Exit Code | Behavior |
|---|---|
| `0` | Success |
| `2` | Blocking error; shown to model |
| Other non-zero | Non-blocking warning; shown to user |

## Effects

No output fields alter agent behavior. Use this hook for:

- Writing session start timestamps to a log file
- Exporting environment variables or secrets into a sidecar file
- Sending a webhook notification that a session opened
- Injecting an initial prompt (CLI `"type": "prompt"` only — see Config Example)

## Special Notes

### `"type": "prompt"` handler (CLI only)

The `sessionStart` event is the only event that supports the `"type": "prompt"` hook type. When used, the value of the `"prompt"` field is fired as a user message at session start, before any human input. This can invoke a slash command or inject a natural-language instruction.

```json
{
  "type": "prompt",
  "prompt": "/load-context"
}
```

### Cloud Agent `source` field

In the Cloud Agent, `source` is always `"new"`. The Cloud Agent does not support session resumption, so `"resume"` and `"startup"` never appear in that environment.

### Cloud Agent config discovery

The Cloud Agent only reads hooks from `.github/hooks/*.json` on the repository's default branch. User-level hook files (`~/.copilot/hooks/`) are not available.

## Config Example

### CLI / Cloud Agent (`config.json`)

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": "echo \"Session $SESSION_ID started\" >> ~/.copilot/session.log",
        "env": {
          "SESSION_ID": "{{sessionId}}"
        },
        "timeoutSec": 10
      }
    ]
  }
}
```

### CLI with prompt injection

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "prompt",
        "prompt": "Load my project context from CLAUDE.md and summarize open tasks."
      }
    ]
  }
}
```

### VS Code (`.github/hooks/session-start.json`)

```json
{
  "version": 1,
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "node ./scripts/session-logger.js",
        "cwd": "/workspace",
        "timeout": 10
      }
    ]
  }
}
```
