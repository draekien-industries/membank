# postToolUse

## Overview

Fires after a tool completes successfully. Use it to audit tool results, inject additional context into the model's view, or rewrite what the LLM sees as the tool's output. Cannot block execution — the tool has already run.

## Surfaces

| Surface | Supported | Notes |
|---|---|---|
| CLI | Yes | Full support: modifiedResult, additionalContext |
| Cloud Agent | Yes | Same output support as CLI |
| VS Code | Yes | Event name is `PostToolUse` (PascalCase); uses `hookSpecificOutput` wrapper |
| JetBrains | Yes | |

## Trigger

After a tool call completes with a successful result (`resultType: "success"`). Does not fire if the tool failed — see `postToolUseFailure` for that case.

## Matcher

The `matcher` field behavior is consistent with `preToolUse`: it applies to `toolName` using an anchored regex `^(?:<pattern>)$`. Only tool completions whose name matches will trigger this hook instance.

## Input Shape

### CLI / Cloud Agent (camelCase)

```json
{
  "sessionId": "string",
  "timestamp": 1716470400000,
  "cwd": "/path/to/workspace",
  "toolName": "bash",
  "toolArgs": {
    "command": "ls -la"
  },
  "toolResult": {
    "resultType": "success",
    "textResultForLlm": "total 48\ndrwxr-xr-x ..."
  }
}
```

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Unique identifier for this session |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `cwd` | `string` | Working directory at invocation time |
| `toolName` | `string` | Name of the tool that ran |
| `toolArgs` | `object` | Arguments that were passed to the tool |
| `toolResult.resultType` | `"success"` | Always `"success"` in this hook |
| `toolResult.textResultForLlm` | `string` | The tool's output text as it would be shown to the LLM |

### VS Code (snake_case)

```json
{
  "hook_event_name": "PostToolUse",
  "session_id": "string",
  "timestamp": "2026-05-23T00:00:00.000Z",
  "cwd": "/path/to/workspace",
  "tool_name": "bash",
  "tool_input": {
    "command": "ls -la"
  },
  "tool_result": {
    "result_type": "success",
    "text_result_for_llm": "total 48\ndrwxr-xr-x ..."
  }
}
```

| Field | Type | Description |
|---|---|---|
| `hook_event_name` | `"PostToolUse"` | Fixed discriminator value |
| `session_id` | `string` | Unique identifier for this session |
| `timestamp` | `string` | ISO 8601 timestamp |
| `cwd` | `string` | Working directory at invocation time |
| `tool_name` | `string` | Name of the tool that ran |
| `tool_input` | `object` | Arguments that were passed to the tool |
| `tool_result.result_type` | `"success"` | Always `"success"` in this hook |
| `tool_result.text_result_for_llm` | `string` | The tool's output as it would be shown to the LLM |

## Output Shape

### CLI / Cloud Agent (stdout JSON)

```json
{
  "modifiedResult": {
    "resultType": "success",
    "textResultForLlm": "string — replacement text the LLM will see"
  },
  "additionalContext": "string — extra information appended to the LLM's view"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `modifiedResult` | `object` | No | Replaces the tool's output entirely in the LLM's context |
| `modifiedResult.resultType` | `"success"` | When `modifiedResult` present | Must be `"success"` |
| `modifiedResult.textResultForLlm` | `string` | When `modifiedResult` present | The replacement text the LLM receives |
| `additionalContext` | `string` | No | Appended to the LLM's view of the tool result; max 10 KB aggregated across all postToolUse hooks |

### VS Code (`hookSpecificOutput` wrapper)

```json
{
  "decision": "block",
  "reason": "string",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "string"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `decision` | `"block"?` | Present only when blocking (VS Code specific) |
| `reason` | `string?` | Reason for block, shown to user |
| `hookSpecificOutput.hookEventName` | `"PostToolUse"` | Fixed discriminator |
| `hookSpecificOutput.additionalContext` | `string?` | Additional context injected into the model's view |

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

- Result replacement: return `modifiedResult` to replace what the LLM sees as the tool's output. The original output is discarded from the LLM's context.
- Context injection: return `additionalContext` to append information to the tool result without replacing it.
- No blocking: this hook cannot prevent the tool from having run. It can only influence what the model sees afterward.

## Special Notes

### `additionalContext` size limit

The combined `additionalContext` output across all `postToolUse` hooks in a single tool call is capped at 10 KB. Content beyond this limit is truncated or ignored.

### Cannot block tool execution

The tool has already executed by the time this hook fires. To prevent a tool from running, use `preToolUse` instead.

### `modifiedResult` replaces entirely

When `modifiedResult` is returned, the entire `textResultForLlm` is replaced. There is no merging with the original output. If you want to augment rather than replace, use `additionalContext`.

### Hook ordering

Multiple `postToolUse` hooks execute in the order they are defined. Each hook receives the original tool result (not the result from previous hooks' `modifiedResult`). If multiple hooks return `modifiedResult`, the last one wins. `additionalContext` from multiple hooks is aggregated up to the 10 KB limit.

## Config Example

### Log tool results to a file

```json
{
  "version": 1,
  "hooks": {
    "postToolUse": [
      {
        "type": "command",
        "bash": "jq -c '{tool: .toolName, result: .toolResult.textResultForLlm}' >> ~/.copilot/tool-results.ndjson",
        "timeoutSec": 5
      }
    ]
  }
}
```

### Inject additional context for web_fetch results

```json
{
  "version": 1,
  "hooks": {
    "postToolUse": [
      {
        "type": "command",
        "bash": "node ./scripts/enrich-fetch-result.js",
        "matcher": "web_fetch",
        "timeoutSec": 10
      }
    ]
  }
}
```

### Scrub secrets from bash output before the LLM sees it

```json
{
  "version": 1,
  "hooks": {
    "postToolUse": [
      {
        "type": "command",
        "bash": "node ./scripts/scrub-secrets.js",
        "matcher": "bash|powershell",
        "timeoutSec": 10
      }
    ]
  }
}
```

### VS Code (`.github/hooks/post-tool.json`)

```json
{
  "version": 1,
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "node ./scripts/audit-tool-result.js",
        "timeout": 10
      }
    ]
  }
}
```
