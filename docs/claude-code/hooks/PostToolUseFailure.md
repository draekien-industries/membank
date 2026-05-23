# PostToolUseFailure

## Trigger

Fires when a tool call fails — non-zero exit code or an exception thrown by the tool. Does not fire on successful tool calls — use `PostToolUse` for those.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on tool name. Same matching rules as `PreToolUse`.

## Default timeout

600 seconds

## `if` field

Supported. Same syntax as `PreToolUse`.

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "PostToolUseFailure",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "tool_name": "Bash",
  "tool_use_id": "toolu_abc123",
  "tool_input": { },
  "error": "error message string",
  "stderr": "raw stderr output from the tool",
  "duration_ms": 0
}
```

- `tool_input` — the input that was passed to the tool (same shapes as [PreToolUse](PreToolUse.md#tool_input-shapes-by-tool))
- `error` — human-readable error message
- `stderr` — raw stderr output captured from the tool
- `duration_ms` — tool execution time in milliseconds up to the point of failure

## Output

Standard [common output fields](_config.md#common-output-fields) only:

```json
{
  "continue": true,
  "stopReason": "string",
  "suppressOutput": false,
  "systemMessage": "string",
  "terminalSequence": "\033]0;Title\007"
}
```

No `hookSpecificOutput` fields are defined for this event.

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed |
| 2 | stderr shown to Claude; cannot block (tool already failed) |
| 1 / other | Non-blocking error; hook output ignored |

Cannot block. The tool failure has already occurred.

## Config example

```json
{
  "hooks": {
    "PostToolUseFailure": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/on-bash-failure.sh",
            "timeout": 10,
            "statusMessage": "Handling failure..."
          }
        ]
      },
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:9090/metrics/tool-failure",
            "timeout": 5,
            "async": true
          }
        ]
      }
    ]
  }
}
```

## Notes

- This hook complements `PostToolUse`. Together they cover the full lifecycle of a tool call's completion.
- Use this hook for error logging, metrics on failure rates, alerting on unexpected failures, or injecting remediation hints into Claude's context via `systemMessage`.
- `continue: false` in the output will stop Claude entirely even though the hook itself cannot block the failure.
- When a Bash command exits non-zero, both `error` and `stderr` may be populated. `error` is a summary message; `stderr` is the raw output.
- `duration_ms` for failures may be 0 if the tool failed before execution started (e.g., a validation error).
