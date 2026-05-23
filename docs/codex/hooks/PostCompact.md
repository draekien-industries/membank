# PostCompact

## Trigger

Fires after context compaction has completed. Can be used to run post-compaction logic such as restoring state, logging, or injecting a fresh context summary.

## Matcher

Applied against the `trigger` field of the input.

| `trigger` value | When it fires |
|---|---|
| `manual` | User explicitly triggered compaction |
| `auto` | System triggered compaction automatically (context limit reached) |

No matcher (omitted) matches both trigger types. The string `"*"` is treated as a glob and matches everything. All other values are interpreted as regular expressions.

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
  "hook_event_name": "PostCompact",
  "model": "string",
  "trigger": "manual | auto"
}
```

**Notable omission:** `permission_mode` is **not** included in compact hook inputs (unlike all other hooks).

`agent_id` and `agent_type` are omitted (not present, not null) when the hook fires outside a subagent context.

## Output Shape

```json
{
  "continue": true,
  "stopReason": null,
  "systemMessage": null
}
```

No `hookSpecificOutput`, no `decision`, no `additionalContext`.

| Field | Type | Description |
|---|---|---|
| `continue` | boolean | If `false`, stops further processing after compaction. `stopReason` is logged. |
| `stopReason` | string \| null | Logged when `continue` is `false`. |
| `systemMessage` | string \| null | Displayed as a warning in the UI. |

## Exit Code Semantics

| Exit code | Behavior |
|---|---|
| `0` | Success. Stdout is parsed per output shape. |
| Non-zero (any) | Failed. If stderr is non-empty, used as the error message. Otherwise: "hook exited with code N". |

**Exit code `2` has no special meaning for compact hooks.** It is treated as a generic non-zero failure.

## Effects

- `continue: false` — Stops further processing after compaction. `stopReason` is logged.
- `decision: "block"` — **Not supported.** Returns Failed with an error if `decision` is present and set to `"block"`.
- `systemMessage` — Shown as a warning in the UI.
- Plain text stdout — **Ignored.** Has no effect.
- `additionalContext` — Not supported in this hook's output shape.

## Error Conditions

| Condition | Behavior |
|---|---|
| Spawn failure | Failed; session continues |
| Stdin write failure | Process killed; Failed; continues |
| Timeout | Failed; continues |
| Empty stdout | No-op; success |
| Valid JSON stdout | Parsed per output shape |
| JSON-looking but unparseable stdout | Always Failed |
| Plain text stdout | Ignored |
| Non-zero exit (any) | Failed; error from stderr or "hook exited with code N" |
| `decision: "block"` in output | Failed with error |

## Config Example

### config.toml

```toml
[[hooks.PostCompact]]

[[hooks.PostCompact.hooks]]
type = "command"
command = "python3 /path/to/post_compact.py"
commandWindows = "powershell -File C:\\hooks\\post_compact.ps1"
timeout = 30
statusMessage = "post-compaction cleanup"
```

### hooks.json (in `.codex/` folder)

```json
{
  "hooks": {
    "PostCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/post_compact.py",
            "timeout": 30,
            "statusMessage": "post-compaction cleanup"
          }
        ]
      }
    ]
  }
}
```

## Special Notes

- `permission_mode` is absent from the input. This is a deliberate difference from all other hooks. Both `PreCompact` and `PostCompact` share this omission.
- Output shape, exit code semantics, and effects are identical to `PreCompact` — the only difference is the timing (after vs. before compaction).
- Exit code `2` does not have special semantics. All non-zero exits are generic failures.
- Plain text stdout is silently ignored. Only JSON output is meaningful.
- `decision: "block"` is not supported and will cause a Failed result.
- `additionalContext` is not available for this hook.
- Compaction has already completed when this hook runs — `continue: false` stops further session processing, not the compaction itself (which is already done).
- Multiple handlers run concurrently (`FuturesUnordered`). Results are applied in declaration order.
