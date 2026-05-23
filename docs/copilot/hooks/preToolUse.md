# preToolUse

## Overview

Fires before the agent executes any tool call. This is the only hook that can block agent actions. Use it to enforce security policies, validate tool arguments, require confirmations, or substitute modified arguments before the tool runs.

## Surfaces

| Surface | Supported | Notes |
|---|---|---|
| CLI | Yes | Full support: allow, deny, ask, modifiedArgs |
| Cloud Agent | Yes | `"ask"` is treated as `"deny"`; no interactive prompting |
| VS Code | Yes | Event name is `PreToolUse` (PascalCase); uses `hookSpecificOutput` wrapper |
| JetBrains | Yes | |

## Trigger

Immediately before the agent calls any tool. Fires once per tool invocation.

## Matcher

The `matcher` field applies to `toolName`. The value is an anchored regex: `^(?:<pattern>)$`. Only tool invocations whose name matches the pattern will trigger this hook instance.

### Known tool names

| Tool name | Description |
|---|---|
| `ask_user` | Prompts the user for input |
| `bash` | Executes shell commands |
| `create` | Creates a new file |
| `edit` | Edits an existing file |
| `glob` | Finds files by pattern |
| `grep` | Searches file contents |
| `powershell` | Executes PowerShell commands |
| `task` | Spawns a subagent |
| `view` | Reads a file |
| `web_fetch` | Fetches a URL |

### Matcher examples

```json
"matcher": "bash|powershell"
```
Matches only shell execution tools.

```json
"matcher": "bash"
```
Matches only the `bash` tool.

```json
"matcher": "web_fetch"
```
Matches only web fetches.

## Input Shape

### CLI / Cloud Agent (camelCase)

```json
{
  "sessionId": "string",
  "timestamp": 1716470400000,
  "cwd": "/path/to/workspace",
  "toolName": "bash",
  "toolArgs": {
    "command": "rm -rf /tmp/scratch"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Unique identifier for this session |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `cwd` | `string` | Working directory at invocation time |
| `toolName` | `string` | Name of the tool being called |
| `toolArgs` | `object` | Arguments passed to the tool; shape varies by tool |

### VS Code (snake_case)

```json
{
  "hook_event_name": "PreToolUse",
  "session_id": "string",
  "timestamp": "2026-05-23T00:00:00.000Z",
  "cwd": "/path/to/workspace",
  "tool_name": "bash",
  "tool_input": {
    "command": "rm -rf /tmp/scratch"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `hook_event_name` | `"PreToolUse"` | Fixed discriminator value |
| `session_id` | `string` | Unique identifier for this session |
| `timestamp` | `string` | ISO 8601 timestamp |
| `cwd` | `string` | Working directory at invocation time |
| `tool_name` | `string` | Name of the tool being called |
| `tool_input` | `object` | Arguments passed to the tool; shape varies by tool |

## Output Shape

### CLI / Cloud Agent (stdout JSON)

```json
{
  "permissionDecision": "allow | deny | ask",
  "permissionDecisionReason": "string — required when decision is deny",
  "modifiedArgs": {}
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `permissionDecision` | `"allow" \| "deny" \| "ask"` | No | Decision to allow, deny, or ask the user |
| `permissionDecisionReason` | `string` | When `"deny"` | Surfaced to the agent and user as the reason for denial |
| `modifiedArgs` | `object` | No | Replacement arguments; substituted for `toolArgs` before the tool runs |

### VS Code (`hookSpecificOutput` wrapper)

VS Code wraps the output in a `hookSpecificOutput` field:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow | deny | ask",
    "permissionDecisionReason": "string",
    "updatedInput": {},
    "additionalContext": "string"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `hookEventName` | `"PreToolUse"` | Fixed discriminator |
| `permissionDecision` | `"allow" \| "deny" \| "ask"` | Decision |
| `permissionDecisionReason` | `string?` | Reason surfaced to the model |
| `updatedInput` | `object?` | Replacement tool input (VS Code equivalent of `modifiedArgs`) |
| `additionalContext` | `string?` | Additional context injected into the model's view |

## Exit Codes

### CLI / Cloud Agent

| Exit Code | Behavior |
|---|---|
| `0` | Success; stdout parsed as JSON if present; no JSON = implicit `"allow"` |
| `2` | Treated as `"deny"`; execution continues fail-open after logging |
| Other non-zero | Logged as failure; execution continues (fail-open; implicit `"allow"`) |

### VS Code

| Exit Code | Behavior |
|---|---|
| `0` | Success; stdout parsed as JSON |
| `2` | Blocking error; shown to model; tool is blocked |
| Other non-zero | Non-blocking warning; shown to user; tool proceeds |

## Decision Semantics

| Decision | CLI behavior | Cloud Agent behavior |
|---|---|---|
| `"allow"` or no output | Tool executes normally | Tool executes normally |
| `"deny"` | Tool is blocked; `permissionDecisionReason` shown to agent and user | Same |
| `"ask"` | CLI prompts the user interactively | Treated as `"deny"` |

### Multiple hooks

When multiple `preToolUse` hook instances match the same tool call, they execute in order. If any single hook returns `"deny"`, the tool is blocked regardless of what other hooks returned.

### `modifiedArgs` behavior

When `modifiedArgs` is present in the output, the tool receives the modified arguments instead of the original ones. The original arguments are discarded. This allows normalizing, sanitizing, or augmenting tool input before execution.

## Effects

- Blocking: return `"deny"` with a `permissionDecisionReason` to stop the tool from running. The reason is shown to the agent and to the user.
- Substitution: return `modifiedArgs` to alter the tool's input before it runs.
- Pass-through: return nothing (or `"allow"`) to let the tool proceed unchanged.
- Interactive confirmation (CLI only): return `"ask"` to hand off the decision to the user.

## Special Notes

### Only blocking hook

`preToolUse` is the only Copilot hook that can prevent an agent action. All other hooks are observation-only or can only modify what the model sees after the fact.

### Cloud Agent pre-approval

In the Cloud Agent, all tools are pre-approved for execution. However, `preToolUse` hooks still fire and can still deny tools. `"ask"` is not interactive in Cloud Agent and is treated as `"deny"`.

### Argument shape varies by tool

`toolArgs` (camelCase) or `tool_input` (snake_case) is a JSON object whose structure depends on which tool is being called. For `bash`, it has a `command` string. For `edit`, it has `file_path`, `old_string`, and `new_string`. Inspect the tool's schema to match against specific argument values.

## Config Example

### Deny destructive shell commands

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "bash": "node ./scripts/check-bash-command.js",
        "matcher": "bash|powershell",
        "timeoutSec": 10
      }
    ]
  }
}
```

### Allow-list specific tools; deny everything else

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "bash": "echo '{\"permissionDecision\": \"deny\", \"permissionDecisionReason\": \"Only read-only tools are allowed in this environment.\"}'",
        "matcher": "bash|create|edit|powershell",
        "timeoutSec": 5
      }
    ]
  }
}
```

### HTTP policy check

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "http",
        "url": "https://policy.example.com/copilot/tool-check",
        "headers": {
          "X-Source": "copilot-cli"
        },
        "allowedEnvVars": ["GITHUB_TOKEN"],
        "timeoutSec": 15
      }
    ]
  }
}
```

### VS Code agent-scoped hook (`.agent.md` frontmatter)

```yaml
---
hooks:
  PreToolUse:
    - type: command
      command: ./scripts/validate-tool.sh
      timeout: 10
---
```
