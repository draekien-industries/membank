# UserPromptSubmit

## Trigger

Fires each time a user submits a prompt (at the start of every turn). This is the earliest per-turn hook and runs before the model sees the prompt.

## Matcher

Not applied. All configured handlers always run for every prompt submission regardless of content. The `matcher` field is ignored for this hook.

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
  "hook_event_name": "UserPromptSubmit",
  "model": "string",
  "permission_mode": "default | acceptEdits | plan | dontAsk | bypassPermissions",
  "prompt": "string"
}
```

`agent_id` and `agent_type` are omitted (not present, not null) when the hook fires outside a subagent context.

`prompt` is the full text of the user's submitted message.

## Output Shape

Stdout may be empty, valid JSON, or plain text. Plain text stdout (non-JSON) is treated as `additionalContext` and injected into model context for the turn.

```json
{
  "continue": true,
  "stopReason": null,
  "reason": "string | null",
  "decision": "block | null",
  "systemMessage": null,
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "string | null"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `continue` | boolean | If `false`, stops the turn. `stopReason` is logged. |
| `stopReason` | string \| null | Logged when `continue` is `false`. |
| `reason` | string \| null | Required (non-empty) when `decision: "block"`. Surfaced to the user as the blocking explanation. |
| `decision` | `"block"` \| null | If `"block"`, the prompt is blocked. `reason` must be non-empty. |
| `systemMessage` | string \| null | Displayed as a warning in the UI. |
| `hookSpecificOutput.additionalContext` | string \| null | Injected into model context for the turn. |

## Exit Code Semantics

| Exit code | Behavior |
|---|---|
| `0` | Success. Stdout is parsed per output shape. |
| `2` | **Block the prompt.** Blocking reason is read from stderr (plain text). Empty stderr → Failed. |
| Any other non-zero | Failed. Turn continues. |

## Effects

- `continue: false` — Stops the turn. `stopReason` is logged. The prompt is not sent to the model.
- `decision: "block"` with non-empty `reason` — Prompt is blocked. `reason` is surfaced to the user as an explanation. Requires non-empty `reason`; empty reason → Failed.
- Exit code `2` — Prompt is blocked. Reason from stderr is surfaced to the user.
- `additionalContext` — Injected into model context for the current turn. Plain text stdout (non-JSON) is treated identically.
- `systemMessage` — Shown as a warning in the UI.

## Error Conditions

| Condition | Behavior |
|---|---|
| Spawn failure | Failed; turn continues |
| Stdin write failure | Process killed; Failed; continues |
| Timeout | Failed; continues |
| Empty stdout | No-op; success |
| Valid JSON stdout | Parsed per output shape |
| JSON-looking but unparseable stdout | Always Failed |
| Plain text stdout | Treated as `additionalContext` |
| Exit 2 with empty stderr | Failed |
| `decision: "block"` with empty `reason` | Failed |

## Config Example

### config.toml

```toml
[[hooks.UserPromptSubmit]]

[[hooks.UserPromptSubmit.hooks]]
type = "command"
command = "python3 /path/to/prompt_guard.py"
commandWindows = "powershell -File C:\\hooks\\prompt_guard.ps1"
timeout = 10
statusMessage = "validating prompt"
```

### hooks.json (in `.codex/` folder)

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/prompt_guard.py",
            "timeout": 10,
            "statusMessage": "validating prompt"
          }
        ]
      }
    ]
  }
}
```

## Special Notes

- Matcher is not applied for this hook. Every configured handler runs on every prompt, unconditionally.
- Plain text stdout is a supported output form. Non-JSON output is treated as `additionalContext`, making it easy to inject per-turn context from a script that just prints to stdout.
- `decision: "block"` requires a non-empty `reason`. If `reason` is empty or absent when `decision` is `"block"`, the hook fails.
- Exit code `2` is a first-class blocking mechanism. Write the user-facing reason to stderr.
- Multiple handlers in the same block run concurrently (`FuturesUnordered`). Any blocking decision (from JSON or exit code 2) will block the prompt.
