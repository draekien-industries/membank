# SubagentStart

## Trigger

Fires when a subagent (nested agent) is about to start within a session. Runs before the subagent's first turn. Analogous to `SessionStart` but scoped to the subagent rather than the top-level session.

## Matcher

Applied against the `agent_type` field of the input. Use a regex to restrict the hook to specific subagent types.

No matcher (omitted) matches all agent types. The string `"*"` is treated as a glob and matches everything. All other values are interpreted as regular expressions.

## Input Shape

Delivered to the hook process via stdin as JSON.

```json
{
  "session_id": "string",
  "turn_id": "string",
  "transcript_path": "string | null",
  "cwd": "string",
  "hook_event_name": "SubagentStart",
  "model": "string",
  "permission_mode": "default | acceptEdits | plan | dontAsk | bypassPermissions",
  "agent_id": "string",
  "agent_type": "string"
}
```

Unlike `SessionStart`, `turn_id` is included because a parent turn is active when a subagent starts.

## Output Shape

Stdout must be empty or valid JSON. Plain text stdout (non-JSON) is treated as `additionalContext` and injected into the subagent model's context.

```json
{
  "continue": true,
  "stopReason": null,
  "suppressOutput": false,
  "systemMessage": null,
  "hookSpecificOutput": {
    "hookEventName": "SubagentStart",
    "additionalContext": "string | null"
  }
}
```

All fields are optional. Omitted fields use the defaults shown above.

| Field | Type | Description |
|---|---|---|
| `continue` | boolean | **Ignored for SubagentStart.** Only `SessionStart` honours `continue: false`. |
| `stopReason` | string \| null | Logged, but `continue` is not honoured so this has no effect. |
| `suppressOutput` | boolean | Reserved. Parsed but currently ignored. |
| `systemMessage` | string \| null | Displayed as a warning in the UI. |
| `hookSpecificOutput.additionalContext` | string \| null | Injected into the subagent model's context. |

## Exit Code Semantics

| Exit code | Behavior |
|---|---|
| `0` | Success. Stdout is processed per the output shape above. |
| Any non-zero | Failed. Operation continues. Exit code 2 has no special meaning for this hook. |

## Effects

- `continue: false` — **Ignored.** The subagent is not stopped regardless of this field. Only `SessionStart` honours `continue: false`.
- `additionalContext` — String is injected into the subagent model's context for the duration of the subagent's work. Plain text stdout (non-JSON) is treated identically.
- `systemMessage` — Shown as a warning in the UI.

## Error Conditions

| Condition | Behavior |
|---|---|
| Spawn failure | Failed; subagent continues |
| Stdin write failure | Process killed; Failed; continues |
| Timeout | Failed; continues |
| Empty stdout | No-op; success |
| Valid JSON stdout | Parsed per output shape |
| JSON-looking but unparseable stdout | Always Failed |
| Plain text stdout | Treated as `additionalContext` |

## Config Example

### config.toml

```toml
[[hooks.SubagentStart]]
matcher = "^research$"

[[hooks.SubagentStart.hooks]]
type = "command"
command = "python3 /path/to/subagent_start.py"
commandWindows = "powershell -File C:\\hooks\\subagent_start.ps1"
timeout = 10
statusMessage = "preparing subagent"
```

### hooks.json (in `.codex/` folder)

```json
{
  "hooks": {
    "SubagentStart": [
      {
        "matcher": "^research$",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/subagent_start.py",
            "timeout": 10,
            "statusMessage": "preparing subagent"
          }
        ]
      }
    ]
  }
}
```

## Special Notes

- `continue: false` is explicitly ignored for this hook. If you need to prevent a subagent from running, you must do so at a higher level (e.g. `PreToolUse` on whatever tool spawns the subagent).
- `agent_type` is the field used for matching — not `agent_id`.
- Plain text stdout is a supported output form and behaves identically to JSON with `additionalContext` set.
- Multiple handlers in the same matcher block run concurrently (`FuturesUnordered`). Results are applied in declaration order.
