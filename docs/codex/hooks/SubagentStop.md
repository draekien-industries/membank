# SubagentStop

## Trigger

Fires when a subagent (nested agent) finishes its work. Analogous to `Stop` but scoped to the subagent's lifecycle rather than the top-level session turn.

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
  "agent_transcript_path": "string | null",
  "cwd": "string",
  "hook_event_name": "SubagentStop",
  "model": "string",
  "permission_mode": "default | acceptEdits | plan | dontAsk | bypassPermissions",
  "stop_hook_active": true,
  "agent_id": "string",
  "agent_type": "string",
  "last_assistant_message": "string | null"
}
```

Unlike `Stop`, this hook includes:
- `agent_id` — identifier for the specific subagent instance
- `agent_type` — type string used for matching
- `agent_transcript_path` — path to the subagent's own transcript (separate from the main session transcript)

Both `transcript_path` (main session) and `agent_transcript_path` (subagent) are provided.

`stop_hook_active` indicates whether a stop hook is currently active (loop prevention signal — same semantics as in `Stop`).

`last_assistant_message` is the final message from the subagent's last turn, or `null` if unavailable.

## Output Shape

**JSON only.** Plain text stdout is NOT supported. Any non-empty stdout that is not valid JSON is treated as Failed.

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
| `continue` | boolean | If `false`, subagent stops normally. `stopReason` is logged. Takes precedence over `decision: "block"`. |
| `stopReason` | string \| null | Logged when `continue` is `false`. |
| `decision` | `"block"` \| null | If `"block"`, injects `reason` as a continuation prompt to the subagent. |
| `reason` | string \| null | Required non-empty string when `decision: "block"`. |
| `systemMessage` | string \| null | Displayed as a warning in the UI. |

## Exit Code Semantics

Identical to the `Stop` hook.

| Exit code | Behavior |
|---|---|
| `0` | Success. Stdout is parsed per output shape (must be JSON or empty). |
| `2` | **Inject continuation prompt.** Reason is read from stderr (plain text). Subagent continues. Empty stderr → Failed. |
| Any other non-zero | Failed. Subagent stops normally. |

## Effects

Identical to the `Stop` hook, applied to the subagent rather than the top-level session:

- `continue: false` — Subagent stops normally. Takes precedence over `decision: "block"`.
- `decision: "block"` with non-empty `reason` — `reason` is injected as a continuation prompt to the subagent.
- Multiple blocking handlers — reasons concatenated with `"\n\n"` and injected together.
- `decision: "block"` with blank `reason` — Failed.
- Exit code `2` — stderr injected as continuation prompt.
- `systemMessage` — Shown as a warning in the UI.

## Error Conditions

| Condition | Behavior |
|---|---|
| Spawn failure | Failed; subagent stops normally |
| Stdin write failure | Process killed; Failed; stops normally |
| Timeout | Failed; stops normally |
| Empty stdout | No-op; success |
| Valid JSON stdout | Parsed per output shape |
| Non-empty, non-JSON stdout | Always Failed (plain text not permitted) |
| JSON-looking but unparseable stdout | Always Failed |
| Exit 2 with empty stderr | Failed |
| `decision: "block"` with empty `reason` | Failed |

## Config Example

### config.toml

```toml
[[hooks.SubagentStop]]
matcher = "^research$"

[[hooks.SubagentStop.hooks]]
type = "command"
command = "python3 /path/to/subagent_stop.py"
commandWindows = "powershell -File C:\\hooks\\subagent_stop.ps1"
timeout = 30
statusMessage = "checking subagent completion"
```

### hooks.json (in `.codex/` folder)

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "matcher": "^research$",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/subagent_stop.py",
            "timeout": 30,
            "statusMessage": "checking subagent completion"
          }
        ]
      }
    ]
  }
}
```

## Special Notes

- **Plain text stdout is not permitted.** Same restriction as `Stop`. Non-empty, non-JSON stdout is Failed.
- This hook provides `agent_transcript_path` in addition to `transcript_path` — giving access to both the subagent's own transcript and the main session transcript.
- `agent_type` is the matcher field, not `agent_id`. Use `agent_type` regex patterns to target specific subagent kinds.
- `stop_hook_active` serves the same loop-prevention purpose as in `Stop`. Check it before triggering continuation.
- Output shape, exit code semantics, and effects are identical to the `Stop` hook — applied to the subagent scope.
