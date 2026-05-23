# userPromptSubmitted

## Overview

Fires each time the user submits a prompt to the agent. Use it for audit logging, usage analytics, prompt sanitization checks, or rate limiting enforcement. Cannot modify the prompt or block execution.

## Surfaces

| Surface | Supported | Notes |
|---|---|---|
| CLI | Yes | Fires on every prompt submission |
| Cloud Agent | Yes | Fires at most once per job (the initial task prompt) |
| VS Code | Yes | Event name is `UserPromptSubmit` (PascalCase) |
| JetBrains | Yes | |

## Trigger

The user submits a prompt to the agent. In the CLI this fires on every turn. In the Cloud Agent it fires once — for the initial task prompt that triggered the job.

## Matcher

None. The matcher field has no effect on this hook.

## Input Shape

### CLI / Cloud Agent (camelCase)

```json
{
  "sessionId": "string",
  "timestamp": 1716470400000,
  "cwd": "/path/to/workspace",
  "prompt": "string — the full text of the user's prompt"
}
```

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Unique identifier for this session |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `cwd` | `string` | Working directory at the time the prompt was submitted |
| `prompt` | `string` | The full text of the user's submitted prompt |

### VS Code (snake_case)

```json
{
  "hook_event_name": "UserPromptSubmit",
  "session_id": "string",
  "timestamp": "2026-05-23T00:00:00.000Z",
  "cwd": "/path/to/workspace",
  "prompt": "string"
}
```

| Field | Type | Description |
|---|---|---|
| `hook_event_name` | `"UserPromptSubmit"` | Fixed discriminator value |
| `session_id` | `string` | Unique identifier for this session |
| `timestamp` | `string` | ISO 8601 timestamp |
| `cwd` | `string` | Working directory at the time the prompt was submitted |
| `prompt` | `string` | The full text of the user's submitted prompt |

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

No output fields alter agent behavior. The prompt cannot be modified or blocked by this hook. Use this hook for:

- Writing prompt text to an audit log
- Measuring prompt frequency and length for usage dashboards
- Detecting prompt patterns for compliance monitoring
- Sending prompts to an external system for review (async, non-blocking)

## Special Notes

### Cannot block or modify the prompt

`userPromptSubmitted` is an observation-only hook. It fires after the prompt is accepted and cannot intercept, reject, or alter the prompt before the agent processes it. If you need to block based on prompt content, use `preToolUse` to intercept specific tool invocations the prompt would trigger.

### Cloud Agent single-fire

In the Cloud Agent, this hook fires at most once per job. The Cloud Agent processes a single task prompt; there is no interactive back-and-forth where the user submits additional prompts.

### Prompt content

The `prompt` field contains the raw text exactly as submitted by the user, including any slash commands, file references, or multiline content.

## Config Example

### CLI / Cloud Agent — audit logging (`config.json`)

```json
{
  "version": 1,
  "hooks": {
    "userPromptSubmitted": [
      {
        "type": "command",
        "bash": "jq -c '{ts: .timestamp, prompt: .prompt}' >> ~/.copilot/prompt-audit.ndjson",
        "timeoutSec": 5
      }
    ]
  }
}
```

### HTTP audit endpoint

```json
{
  "version": 1,
  "hooks": {
    "userPromptSubmitted": [
      {
        "type": "http",
        "url": "https://audit.example.com/copilot/prompts",
        "headers": {
          "X-Source": "copilot-cli"
        },
        "timeoutSec": 5
      }
    ]
  }
}
```

### VS Code (`.github/hooks/user-prompt.json`)

```json
{
  "version": 1,
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "node ./scripts/log-prompt.js",
        "timeout": 5
      }
    ]
  }
}
```
