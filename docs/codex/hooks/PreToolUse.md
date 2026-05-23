# PreToolUse

## Trigger

Fires before any tool call executes, during the permission-check phase. This is the primary hook for inspecting, modifying, or blocking tool calls before they run.

## Matcher

Applied against the tool name (regex). Examples: `"^Bash$"`, `"^(Read|Write|Edit)$"`.

No matcher (omitted) matches all tool calls. The string `"*"` is treated as a glob and matches everything. All other values are interpreted as regular expressions.

## Input Shape

Delivered to the hook process via stdin as JSON.

```json
{
  "session_id": "string",
  "turn_id": "string",
  "agent_id": "string | omitted",
  "agent_type": "string | omitted",
  "transcript_path": "string | null",
  "cwd": "string",
  "hook_event_name": "PreToolUse",
  "model": "string",
  "permission_mode": "default | acceptEdits | plan | dontAsk | bypassPermissions",
  "tool_name": "string (canonical tool name)",
  "tool_input": "object (tool-specific JSON arguments)",
  "tool_use_id": "string"
}
```

**Notable:** `agent_id` and `agent_type` are **omitted** (not present, not null) when the hook fires outside a subagent context.

## Output Shape

### Modern form (preferred)

```json
{
  "continue": true,
  "stopReason": null,
  "systemMessage": null,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny | null",
    "permissionDecisionReason": "string | null",
    "updatedInput": "object | null",
    "additionalContext": "string | null"
  }
}
```

### Legacy form (deprecated, still parsed)

```json
{
  "decision": "block",
  "reason": "string"
}
```

Use the modern form for all new hooks.

| Field | Type | Description |
|---|---|---|
| `continue` | boolean | If `false`, further processing stops. |
| `stopReason` | string \| null | Logged when `continue` is `false`. |
| `systemMessage` | string \| null | Displayed as a warning in the UI. |
| `hookSpecificOutput.permissionDecision` | `"deny"` \| `"allow"` \| `"ask"` \| null | Decision on the tool call. See below. |
| `hookSpecificOutput.permissionDecisionReason` | string \| null | Shown to the user when the decision is `"deny"`. |
| `hookSpecificOutput.updatedInput` | object \| null | Rewrites the tool's arguments before execution. |
| `hookSpecificOutput.additionalContext` | string \| null | Injected into model context for the turn. |

### Permission decision values

| Value | Behavior |
|---|---|
| `"deny"` | Blocks the tool call. `permissionDecisionReason` is surfaced to the user. |
| `"allow"` | Currently fails open — treated as Failed. Allowing without input rewrite is unsupported in this position. |
| `"ask"` | Currently fails open — treated as Failed. |
| omitted / `null` | No decision. Tool proceeds normally. |

### Input rewrite

Setting `updatedInput` to a non-null object rewrites the tool's arguments before execution. When multiple concurrent handlers both provide `updatedInput`, the **last handler to complete wins**. `updatedInput` is ignored when `permissionDecision` is `"deny"`.

## Exit Code Semantics

| Exit code | Behavior |
|---|---|
| `0` | Success. Stdout is parsed per output shape. |
| `2` | **Block the tool call.** Blocking reason is read from stderr (plain text). Empty stderr → Failed. |
| Any other non-zero | Failed. Tool proceeds normally. |

## Effects

- `permissionDecision: "deny"` — Tool call does not execute. `permissionDecisionReason` is surfaced to the user and the model.
- Exit code `2` — Tool call does not execute. Reason from stderr is surfaced to the user.
- `updatedInput` — Tool arguments are rewritten before the tool executes.
- `additionalContext` — Injected into model context for the current turn.
- `systemMessage` — Shown as a warning in the UI.

## Error Conditions

| Condition | Behavior |
|---|---|
| Spawn failure | Failed; tool proceeds |
| Stdin write failure | Process killed; Failed; tool proceeds |
| Timeout | "hook timed out after Ns" set as error; Failed; tool proceeds |
| Empty stdout | No-op; success |
| Valid JSON stdout | Parsed per output shape |
| JSON-looking but unparseable stdout | Always Failed |
| Plain text stdout | Not treated as context (ignored) |
| Exit 2 with empty stderr | Failed |

## Config Example

### config.toml

```toml
[[hooks.PreToolUse]]
matcher = "^Bash$"

[[hooks.PreToolUse.hooks]]
type = "command"
command = "python3 /path/to/pre_tool_use.py"
commandWindows = "powershell -File C:\\hooks\\pre_tool_use.ps1"
timeout = 10
statusMessage = "checking policy"
```

### hooks.json (in `.codex/` folder)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/pre_tool_use.py",
            "timeout": 10,
            "statusMessage": "checking policy"
          }
        ]
      }
    ]
  }
}
```

## Special Notes

- This hook runs **during the permission-check phase** — before the tool executes and before interactive approval UI is shown (if any). It is the primary enforcement point for tool policy.
- Exit code `2` is a first-class mechanism for blocking. The blocking reason must be written to stderr, not stdout.
- `"allow"` and `"ask"` decisions currently fail open — they are not valid ways to approve a tool call from this hook; only `"deny"` and `null` are reliably handled.
- `updatedInput` can modify any field of the tool's input object. The rewritten input is what the tool sees at execution time.
- Multiple handlers in the same matcher block run concurrently. For `updatedInput`, last-to-complete wins. For `permissionDecision`, any `"deny"` blocks the call regardless of order.
- The auto-generated JSON Schema file for this hook is `pre-tool-use.command.input.schema.json` / `pre-tool-use.command.output.schema.json` in `codex-rs/hooks/schema/generated/`.
