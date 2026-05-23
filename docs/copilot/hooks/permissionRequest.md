# permissionRequest

## Overview

Fires before the permission service evaluates a tool execution request — before rule checks, session approvals, auto-allow/auto-deny logic, and user prompting. Can programmatically allow or deny the tool, short-circuiting the entire permission flow. CLI-only; Cloud Agent pre-approves all tools.

## Surfaces

| Surface | Supported | Notes |
|---|---|---|
| CLI | Yes | Full allow/deny support; short-circuits normal permission flow |
| Cloud Agent | No | All tools are pre-approved in Cloud Agent; this hook never fires |
| VS Code | No | Not applicable to VS Code |
| JetBrains | No | Not applicable to JetBrains |

## Trigger

Before the permission service runs for any tool execution that requires a permission check. Fires for every tool call subject to the permission system — including those that might otherwise be auto-allowed or auto-denied by existing rules.

## Matcher

The `matcher` field applies to `toolName`. The value is an anchored regex: `^(?:<pattern>)$`. Only permission requests for tools whose name matches the pattern will trigger this hook instance.

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
Matches shell execution tools only.

```json
"matcher": "create|edit"
```
Matches file mutation tools only.

## Input Shape

`permissionRequest` receives the same input format as `preToolUse`.

### CLI (camelCase)

```json
{
  "sessionId": "string",
  "timestamp": 1716470400000,
  "cwd": "/path/to/workspace",
  "toolName": "bash",
  "toolArgs": {
    "command": "npm publish"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Unique identifier for this session |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `cwd` | `string` | Working directory at request time |
| `toolName` | `string` | Name of the tool requesting permission |
| `toolArgs` | `object` | Arguments the tool will receive; shape varies by tool |

## Output Shape

### CLI (stdout JSON)

```json
{
  "behavior": "allow | deny",
  "message": "string — reason fed to the LLM when denying",
  "interrupt": true
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `behavior` | `"allow" \| "deny"` | No | Decision to allow or deny; omit to fall through to normal permission handling |
| `message` | `string` | No | Reason string fed to the LLM; most useful when `behavior` is `"deny"` |
| `interrupt` | `boolean` | No | When `true` and denying, the agent is stopped immediately rather than continuing |

## Exit Codes

| Exit Code | Behavior |
|---|---|
| `0` | Success; stdout parsed as JSON if present; omitting `behavior` = fall through to normal flow |
| `2` | Treated as `"deny"`; execution stops for this tool |
| Other non-zero | Logged as failure; execution continues (fail-open) |

## Decision Logic

| Output | Effect |
|---|---|
| `"behavior": "allow"` | Permission granted; normal permission service checks are skipped |
| `"behavior": "deny"` | Permission denied; `message` is shown to the LLM; normal checks are skipped |
| No output / omit `behavior` | Falls through to the normal permission service (rule checks, session approvals, user prompting) |
| Exit code `2` | Treated as `"deny"` |

### `interrupt` semantics

When `behavior` is `"deny"` and `interrupt` is `true`, the agent is stopped immediately at the denial point. The agent does not attempt to continue with other instructions. When `interrupt` is `false` or omitted, the denial is reported to the model, which may attempt a different approach.

### Ordering relative to `preToolUse`

`permissionRequest` fires before the permission service. `preToolUse` fires after the permission service grants access, immediately before the tool executes. A tool blocked by `permissionRequest` never reaches `preToolUse`.

### Multiple hooks

When multiple `permissionRequest` hook instances match the same tool, they execute in order. If any hook returns `"deny"` or exits with code 2, the tool is denied. A hook returning `"allow"` short-circuits further permission service checks but does not prevent subsequent hooks in the same event from running.

## Effects

- `"allow"`: tool is granted permission without going through rule checks, session approval, or user prompting.
- `"deny"` + `message`: tool is blocked; `message` is surfaced to the LLM as the denial reason.
- `"deny"` + `interrupt: true`: tool is blocked and the agent is halted immediately.
- No output: the normal permission service flow continues as if the hook was not present.

## Special Notes

### Earlier than `preToolUse`

`permissionRequest` fires at the permission decision boundary — before rules are consulted and before the user is prompted. `preToolUse` fires after permission is granted. Use `permissionRequest` when you want to make a programmatic allow/deny decision instead of (not in addition to) the standard rule system.

### CLI-only

Cloud Agent pre-approves all tool executions and does not use the CLI permission system. This hook never fires in Cloud Agent, VS Code, or JetBrains.

### `https://` required for HTTP hooks with `allowedEnvVars`

If using the HTTP hook type for `permissionRequest` and the `allowedEnvVars` field is populated, the URL must use `https://`. Plain HTTP is rejected in this combination.

### Difference from `preToolUse`

| Aspect | `permissionRequest` | `preToolUse` |
|---|---|---|
| When it fires | Before permission service | After permission granted |
| Output field for decision | `behavior` | `permissionDecision` |
| Can modify tool args | No | Yes (`modifiedArgs`) |
| Surfaces | CLI only | CLI + Cloud Agent |
| Normal flow bypass | Yes — can short-circuit rule checks | No — fires after rules |

## Config Example

### Block `npm publish` from the agent

```bash
#!/usr/bin/env bash
# scripts/check-publish.sh

COMMAND=$(cat - | jq -r '.toolArgs.command // empty')
if echo "$COMMAND" | grep -q 'npm publish'; then
  echo '{"behavior": "deny", "message": "npm publish is not permitted from the agent. Run it manually after review.", "interrupt": false}'
  exit 0
fi
exit 0
```

```json
{
  "version": 1,
  "hooks": {
    "permissionRequest": [
      {
        "type": "command",
        "bash": "./scripts/check-publish.sh",
        "matcher": "bash",
        "timeoutSec": 5
      }
    ]
  }
}
```

### Allow all read-only tools; deny write tools in a CI context

```json
{
  "version": 1,
  "hooks": {
    "permissionRequest": [
      {
        "type": "command",
        "bash": "echo '{\"behavior\": \"deny\", \"message\": \"Write operations are not permitted in CI review mode.\", \"interrupt\": false}'",
        "matcher": "bash|powershell|create|edit",
        "timeoutSec": 5
      }
    ]
  }
}
```

### HTTP policy service

```json
{
  "version": 1,
  "hooks": {
    "permissionRequest": [
      {
        "type": "http",
        "url": "https://policy.example.com/copilot/permission",
        "headers": {
          "X-Source": "copilot-cli"
        },
        "allowedEnvVars": ["GITHUB_TOKEN"],
        "timeoutSec": 10
      }
    ]
  }
}
```

### Allow all web fetches unconditionally (bypass prompting)

```json
{
  "version": 1,
  "hooks": {
    "permissionRequest": [
      {
        "type": "command",
        "bash": "echo '{\"behavior\": \"allow\"}'",
        "matcher": "web_fetch",
        "timeoutSec": 3
      }
    ]
  }
}
```
