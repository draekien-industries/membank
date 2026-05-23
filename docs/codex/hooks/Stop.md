# Stop

## Trigger

Fires when the agent finishes a turn and reaches a natural stopping point. Can be used to inspect the final assistant message and optionally trigger continuation (cause another turn to begin).

## Matcher

Not applied. All configured handlers always run at every stop event, regardless of content. The `matcher` field is ignored for this hook.

## Input Shape

Delivered to the hook process via stdin as JSON.

```json
{
  "session_id": "string",
  "turn_id": "string",
  "transcript_path": "string | null",
  "cwd": "string",
  "hook_event_name": "Stop",
  "model": "string",
  "permission_mode": "default | acceptEdits | plan | dontAsk | bypassPermissions",
  "stop_hook_active": true,
  "last_assistant_message": "string | null"
}
```

Note: `agent_id` and `agent_type` are NOT included. `turn_id` is included.

`stop_hook_active` indicates whether a stop hook is currently active (i.e. this invocation is itself the result of a stop hook triggering continuation). Use this to prevent infinite loops: if `stop_hook_active` is `true` and you would normally trigger continuation, consider suppressing it.

`last_assistant_message` is the final message content from the assistant in the completed turn, or `null` if unavailable.

## Output Shape

**JSON only.** Plain text stdout is NOT supported for this hook. Any non-empty stdout that is not valid JSON is treated as Failed.

```json
{
  "continue": true,
  "stopReason": null,
  "decision": "block | null",
  "reason": "string | null",
  "systemMessage": null
}
```

No `hookSpecificOutput` for this hook.

| Field | Type | Description |
|---|---|---|
| `continue` | boolean | If `false`, agent stops normally. `stopReason` is logged. Takes precedence over `decision: "block"`. |
| `stopReason` | string \| null | Logged when `continue` is `false`. |
| `decision` | `"block"` \| null | If `"block"`, injects `reason` as a continuation prompt, causing another turn. |
| `reason` | string \| null | Required non-empty string when `decision: "block"`. Injected as a continuation prompt to the model. |
| `systemMessage` | string \| null | Displayed as a warning in the UI. |

## Exit Code Semantics

| Exit code | Behavior |
|---|---|
| `0` | Success. Stdout is parsed per output shape (must be JSON or empty). |
| `2` | **Inject continuation prompt.** The continuation reason is read from stderr (plain text). Agent continues with another turn. Empty stderr → Failed. |
| Any other non-zero | Failed. Agent stops normally. |

## Effects

- `continue: false` — Agent stops normally. `stopReason` is logged. Takes precedence over `decision: "block"` if both are present.
- `decision: "block"` with non-empty `reason` — `reason` is injected as a continuation prompt to the model, causing another turn to begin.
- Multiple handlers with `decision: "block"`: reasons from all blocking handlers are concatenated with `"\n\n"` and injected together as a single continuation prompt.
- `decision: "block"` with blank/empty `reason` — Failed.
- Exit code `2` — stderr content is injected as a continuation prompt. Agent continues.
- `systemMessage` — Shown as a warning in the UI.

## Error Conditions

| Condition | Behavior |
|---|---|
| Spawn failure | Failed; agent stops normally |
| Stdin write failure | Process killed; Failed; stops normally |
| Timeout | Failed; stops normally |
| Empty stdout | No-op; success; agent stops normally |
| Valid JSON stdout | Parsed per output shape |
| Non-empty, non-JSON stdout | Always Failed (plain text not permitted) |
| JSON-looking but unparseable stdout | Always Failed |
| Exit 2 with empty stderr | Failed |
| `decision: "block"` with empty `reason` | Failed |
| `continue: false` and `decision: "block"` both set | `continue: false` takes precedence; agent stops |

## Config Example

### config.toml

```toml
[[hooks.Stop]]

[[hooks.Stop.hooks]]
type = "command"
command = "python3 /path/to/stop_hook.py"
commandWindows = "powershell -File C:\\hooks\\stop_hook.ps1"
timeout = 30
statusMessage = "checking completion"
```

### hooks.json (in `.codex/` folder)

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/stop_hook.py",
            "timeout": 30,
            "statusMessage": "checking completion"
          }
        ]
      }
    ]
  }
}
```

## Special Notes

- **Plain text stdout is not permitted.** This is unlike `SessionStart`, `SubagentStart`, and `UserPromptSubmit`. Any non-empty stdout that is not valid JSON causes a Failed result.
- `stop_hook_active` is the loop-prevention signal. Always check this field before triggering continuation to avoid infinite loops.
- Matcher is not applied for this hook. Every configured handler runs at every stop event.
- When multiple handlers produce `decision: "block"`, their `reason` values are concatenated with `"\n\n"` — the model receives all reasons as a single message.
- `continue: false` always wins over `decision: "block"` when both are present in the same output object.
- Use exit code `2` + stderr as the simplest way to trigger continuation from a shell script.
