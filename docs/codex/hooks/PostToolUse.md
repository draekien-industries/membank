# PostToolUse

## Trigger

Fires after a tool call completes and produced output (success). Does not fire if the tool call was blocked or failed to execute.

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
  "hook_event_name": "PostToolUse",
  "model": "string",
  "permission_mode": "default | acceptEdits | plan | dontAsk | bypassPermissions",
  "tool_name": "string",
  "tool_input": "object",
  "tool_response": "object (tool output)",
  "tool_use_id": "string"
}
```

`agent_id` and `agent_type` are omitted (not present, not null) when the hook fires outside a subagent context.

`tool_response` contains the structured output produced by the tool. Its shape is tool-specific.

## Output Shape

```json
{
  "continue": true,
  "stopReason": null,
  "reason": "string | null",
  "systemMessage": null,
  "decision": "block | null",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "string | null",
    "updatedMCPToolOutput": null
  }
}
```

| Field | Type | Description |
|---|---|---|
| `continue` | boolean | If `false`, stops the agent turn. `stopReason` is logged; `reason` is surfaced to the model. |
| `stopReason` | string \| null | Logged when `continue` is `false`. |
| `reason` | string \| null | Surfaced to the model when `continue: false` or `decision: "block"`. |
| `systemMessage` | string \| null | Displayed as a warning in the UI. |
| `decision` | `"block"` \| null | If `"block"`, the tool result status becomes Blocked. `reason` is surfaced to the model as feedback. Does not stop the agent. |
| `hookSpecificOutput.additionalContext` | string \| null | Injected into model context for the current turn. |
| `hookSpecificOutput.updatedMCPToolOutput` | must be `null` | See warning below. |

### Fail-closed field

`updatedMCPToolOutput` is reserved. If present and non-null, the hook **fails open** (treated as Failed). Always pass `null` or omit the field.

## Exit Code Semantics

| Exit code | Behavior |
|---|---|
| `0` | Success. Stdout is parsed per output shape. |
| `2` | Feedback mode. The feedback message is read from stderr (plain text) and surfaced to the model. Does **not** block the agent — it adds context. Empty stderr → Failed. |
| Any other non-zero | Failed. Agent continues normally. |

## Effects

- `continue: false` — Stops the agent turn. `stopReason` is logged. `reason` is surfaced to the model.
- `decision: "block"` — Tool result status becomes Blocked. `reason` is surfaced to the model as feedback. The agent continues (not stopped).
- Exit code `2` — stderr content is surfaced to the model as feedback for the current turn. The agent is not stopped.
- `additionalContext` — Injected into model context for the current turn.
- `systemMessage` — Shown as a warning in the UI.

**Plain text stdout is ignored.** Unlike `SessionStart` and `UserPromptSubmit`, non-JSON stdout from `PostToolUse` has no effect.

## Error Conditions

| Condition | Behavior |
|---|---|
| Spawn failure | Failed; agent continues |
| Stdin write failure | Process killed; Failed; continues |
| Timeout | "hook timed out after Ns" set as error; Failed; continues |
| Empty stdout | No-op; success |
| Valid JSON stdout | Parsed per output shape |
| JSON-looking but unparseable stdout | Always Failed |
| Plain text stdout | Ignored (no effect) |
| Exit 2 with empty stderr | Failed |

## Config Example

### config.toml

```toml
[[hooks.PostToolUse]]
matcher = "^Write$"

[[hooks.PostToolUse.hooks]]
type = "command"
command = "python3 /path/to/post_tool_use.py"
commandWindows = "powershell -File C:\\hooks\\post_tool_use.ps1"
timeout = 30
statusMessage = "post-processing write"
```

### hooks.json (in `.codex/` folder)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "^Write$",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/post_tool_use.py",
            "timeout": 30,
            "statusMessage": "post-processing write"
          }
        ]
      }
    ]
  }
}
```

## Special Notes

- This hook fires only on **successful** tool completion. A tool call that was blocked by `PreToolUse` or `PermissionRequest` does not trigger `PostToolUse`.
- `continue: false` and `decision: "block"` have distinct semantics: `continue: false` stops the agent turn; `decision: "block"` marks the result as blocked and feeds back to the model without stopping the turn.
- Exit code `2` is a feedback mechanism — not a block. Use it to inject information into the model's context without halting execution.
- Plain text stdout is silently ignored. If you want to inject context, use JSON with `additionalContext`.
- `updatedMCPToolOutput` appears in the schema but is reserved and fail-open if non-null. Do not use it.
- The auto-generated JSON Schema file for this hook is `post-tool-use.command.input.schema.json` / `post-tool-use.command.output.schema.json` in `codex-rs/hooks/schema/generated/`.
