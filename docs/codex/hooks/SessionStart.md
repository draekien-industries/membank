# SessionStart

## Trigger

Fires when a session begins, resumes, is cleared, or is reset after compaction. This is the earliest hook in the session lifecycle — it runs before the first turn and before any tools are available to the model.

## Matcher

Applied against the `source` field of the input. Use a regex to restrict the hook to specific session origins.

| `source` value | When it fires |
|---|---|
| `startup` | Fresh session start |
| `resume` | Session resumed from a saved state |
| `clear` | Session was cleared (e.g. `/clear`) |
| `compact` | Session reset after context compaction |

No matcher (omitted) matches all sources. The string `"*"` is treated as a glob and matches everything. All other values are interpreted as regular expressions.

## Input Shape

Delivered to the hook process via stdin as JSON.

```json
{
  "session_id": "string (UUID)",
  "transcript_path": "string | null",
  "cwd": "string (absolute path)",
  "hook_event_name": "SessionStart",
  "model": "string",
  "permission_mode": "default | acceptEdits | plan | dontAsk | bypassPermissions",
  "source": "startup | resume | clear | compact"
}
```

**Notable omissions:**
- `turn_id` is NOT included (no turn has started yet).
- `agent_id` and `agent_type` are NOT included (not in subagent context).

## Output Shape

Stdout must be empty or valid JSON. Plain text stdout (no JSON) is treated as `additionalContext` and injected directly into the model's context for the session.

```json
{
  "continue": true,
  "stopReason": null,
  "suppressOutput": false,
  "systemMessage": null,
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "string | null"
  }
}
```

All fields are optional. Omitted fields use the defaults shown above.

| Field | Type | Description |
|---|---|---|
| `continue` | boolean | If `false`, the session is stopped before the first turn. |
| `stopReason` | string \| null | Logged when `continue` is `false`. |
| `suppressOutput` | boolean | Reserved. Parsed but currently ignored. |
| `systemMessage` | string \| null | Displayed as a warning in the UI. |
| `hookSpecificOutput.additionalContext` | string \| null | Injected into model context for the entire session. |

## Exit Code Semantics

| Exit code | Behavior |
|---|---|
| `0` | Success. Stdout is processed per the output shape above. |
| Any non-zero | Failed. Operation continues. Exit code 2 has no special meaning for this hook. |

## Effects

- `continue: false` — Session is stopped before the first turn begins. `stopReason` is logged.
- `additionalContext` — String is injected into the model's context and remains available for the duration of the session. Plain text stdout (non-JSON) is treated identically.
- `systemMessage` — Shown as a warning in the UI regardless of other fields.

## Error Conditions

| Condition | Behavior |
|---|---|
| Spawn failure | Failed; session continues |
| Stdin write failure | Process killed; Failed; session continues |
| Timeout | Failed; session continues |
| Empty stdout | No-op; success |
| Valid JSON stdout | Parsed per output shape |
| JSON-looking but unparseable stdout | Always Failed |
| Plain text stdout | Treated as `additionalContext` |

## Config Example

### config.toml

```toml
[[hooks.SessionStart]]
matcher = "^startup$"

[[hooks.SessionStart.hooks]]
type = "command"
command = "python3 /path/to/session_start.py"
commandWindows = "powershell -File C:\\hooks\\session_start.ps1"
timeout = 10
statusMessage = "initialising session"
```

### hooks.json (in `.codex/` folder)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "^startup$",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/session_start.py",
            "timeout": 10,
            "statusMessage": "initialising session"
          }
        ]
      }
    ]
  }
}
```

## Special Notes

- This is the only hook where `turn_id` is absent from the input — a turn has not yet been created.
- Plain text stdout is a supported output form and behaves identically to JSON with `additionalContext` set.
- `continue: false` is honoured — this is one of the hooks where stopping the session is meaningful.
- Multiple handlers in the same matcher block run concurrently (`FuturesUnordered`). Results are applied in declaration order.
