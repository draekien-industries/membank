# PreCompact

## Trigger

Fires before context compaction (summarization) is performed. Can be used to cancel compaction or run pre-compaction logic such as saving state.

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
  "hook_event_name": "PreCompact",
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
| `continue` | boolean | If `false`, compaction is cancelled. `stopReason` is logged. |
| `stopReason` | string \| null | Logged when `continue` is `false`. |
| `systemMessage` | string \| null | Displayed as a warning in the UI. |

## Exit Code Semantics

| Exit code | Behavior |
|---|---|
| `0` | Success. Stdout is parsed per output shape. |
| Non-zero (any) | Failed. If stderr is non-empty, used as the error message. Otherwise: "hook exited with code N". |

**Exit code `2` has no special meaning for compact hooks.** It is treated as a generic non-zero failure, not a semantic block.

## Effects

- `continue: false` — Compaction is cancelled. `stopReason` is logged.
- `decision: "block"` — **Not supported.** Returns Failed with an error if `decision` is present and set to `"block"`.
- `systemMessage` — Shown as a warning in the UI.
- Plain text stdout — **Ignored.** Has no effect (unlike `SessionStart` or `UserPromptSubmit`).
- `additionalContext` — Not supported in this hook's output shape.

## Error Conditions

| Condition | Behavior |
|---|---|
| Spawn failure | Failed; compaction continues |
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
[[hooks.PreCompact]]
matcher = "^auto$"

[[hooks.PreCompact.hooks]]
type = "command"
command = "python3 /path/to/pre_compact.py"
commandWindows = "powershell -File C:\\hooks\\pre_compact.ps1"
timeout = 30
statusMessage = "preparing for compaction"
```

### hooks.json (in `.codex/` folder)

```json
{
  "hooks": {
    "PreCompact": [
      {
        "matcher": "^auto$",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/pre_compact.py",
            "timeout": 30,
            "statusMessage": "preparing for compaction"
          }
        ]
      }
    ]
  }
}
```

## Special Notes

- `permission_mode` is absent from the input. This is a deliberate difference from all other hooks.
- Exit code `2` does not have special semantics here. To cancel compaction, use `continue: false` in JSON output or return a generic non-zero exit code (though non-zero only marks Failed and does not cancel — use JSON `continue: false` to cancel).
- Plain text stdout is silently ignored. Only JSON output is meaningful.
- `decision: "block"` is not supported in the output and will cause a Failed result if used.
- `additionalContext` is not available for this hook.
- Multiple handlers run concurrently. Any handler returning `continue: false` will cancel compaction.
