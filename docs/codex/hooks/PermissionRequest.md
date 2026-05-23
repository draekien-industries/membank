# PermissionRequest

## Trigger

Fires in the approval path, specifically before the guardian or interactive approval UI would be shown to the user. This is separate from `PreToolUse` — it runs only when explicit approval would normally be requested, not on every tool call.

## Matcher

Applied against the tool name (regex). Examples: `"^Bash$"`, `"^Write$"`.

No matcher (omitted) matches all tool names. The string `"*"` is treated as a glob and matches everything. All other values are interpreted as regular expressions.

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
  "hook_event_name": "PermissionRequest",
  "model": "string",
  "permission_mode": "default | acceptEdits | plan | dontAsk | bypassPermissions",
  "tool_name": "string",
  "tool_input": "object"
}
```

**Notable omission:** `tool_use_id` is **not** present in the input (unlike `PreToolUse`).

`agent_id` and `agent_type` are omitted (not present, not null) when the hook fires outside a subagent context.

## Output Shape

```json
{
  "continue": true,
  "stopReason": null,
  "systemMessage": null,
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow | deny",
      "message": "string | null",
      "updated_input": null,
      "updated_permissions": null,
      "interrupt": false
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `continue` | boolean | If `false`, stops further processing. |
| `stopReason` | string \| null | Logged when `continue` is `false`. |
| `systemMessage` | string \| null | Displayed as a warning in the UI. |
| `hookSpecificOutput.decision.behavior` | `"allow"` \| `"deny"` | The permission decision. |
| `hookSpecificOutput.decision.message` | string \| null | Shown to the user alongside the decision. |
| `hookSpecificOutput.decision.updated_input` | must be `null` | See warning below. |
| `hookSpecificOutput.decision.updated_permissions` | must be `null` | See warning below. |
| `hookSpecificOutput.decision.interrupt` | must be `false` | See warning below. |

### Fail-closed fields

The following fields in `decision` will cause the hook to **fail closed** if set to non-null or true values:

- `updated_input` — if non-null, hook fails
- `updated_permissions` — if non-null, hook fails
- `interrupt: true` — if true, hook fails

Always set these to `null` / `false` or omit them entirely.

### Decision resolution (multiple handlers)

- Any `"deny"` decision wins immediately, regardless of the order handlers run or complete.
- If no handler produces a `"deny"`, the last `"allow"` decision wins.
- If no handler produces any decision, the normal approval flow (UI prompt) continues.

## Exit Code Semantics

| Exit code | Behavior |
|---|---|
| `0` | Success. Stdout is parsed per output shape. |
| `2` | **Deny the permission.** Denial reason is read from stderr (plain text). Empty stderr → Failed. |
| Any other non-zero | Failed. Normal approval flow continues. |

## Effects

- `decision.behavior: "deny"` — Permission is denied. Tool does not execute. `message` is shown to the user.
- `decision.behavior: "allow"` — Permission is granted. Interactive approval UI is skipped.
- Exit code `2` — Permission denied. Reason from stderr is surfaced to the user.
- No decision from any handler — Normal approval flow (interactive UI) continues.
- `systemMessage` — Shown as a warning in the UI.

## Error Conditions

| Condition | Behavior |
|---|---|
| Spawn failure | Failed; normal approval flow continues |
| Stdin write failure | Process killed; Failed; continues |
| Timeout | Failed; continues |
| Empty stdout | No-op; success; normal approval flow continues |
| Valid JSON stdout | Parsed per output shape |
| JSON-looking but unparseable stdout | Always Failed |
| Plain text stdout | Ignored (no `additionalContext` support for this hook) |
| Exit 2 with empty stderr | Failed |

## Config Example

### config.toml

```toml
[[hooks.PermissionRequest]]
matcher = "^Bash$"

[[hooks.PermissionRequest.hooks]]
type = "command"
command = "python3 /path/to/permission_check.py"
commandWindows = "powershell -File C:\\hooks\\permission_check.ps1"
timeout = 10
statusMessage = "checking permission"
```

### hooks.json (in `.codex/` folder)

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/permission_check.py",
            "timeout": 10,
            "statusMessage": "checking permission"
          }
        ]
      }
    ]
  }
}
```

## Special Notes

- This hook fires specifically in the **approval path** — it only runs when the system would otherwise prompt the user for interactive approval. It does not fire on every tool call.
- `tool_use_id` is absent from the input. This is a deliberate difference from `PreToolUse`.
- `updated_input` and `updated_permissions` appear in the schema but are fail-closed — always pass `null`. Do not attempt to use them for input rewriting; use `PreToolUse.updatedInput` instead.
- `interrupt: true` is also fail-closed. Always pass `false` or omit the field.
- The deny-wins resolution means a single denying handler blocks the tool even if other handlers approve it.
- The auto-generated JSON Schema file for this hook is `permission-request.command.input.schema.json` / `permission-request.command.output.schema.json` in `codex-rs/hooks/schema/generated/`.
