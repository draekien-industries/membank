# PostToolUse

## Trigger

Fires after a tool call completes successfully (exits cleanly without error). Does not fire when a tool fails — use `PostToolUseFailure` for that.

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
  "hook_event_name": "PostToolUse",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "tool_name": "Bash",
  "tool_use_id": "toolu_abc123",
  "tool_input": { },
  "tool_response": { },
  "duration_ms": 5432
}
```

- `tool_input` — the input that was passed to the tool (same shapes as [PreToolUse](PreToolUse.md#tool_input-shapes-by-tool))
- `tool_response` — the output returned by the tool (tool-specific shape)
- `duration_ms` — tool execution time in milliseconds; excludes time spent in permission prompts and PreToolUse hook execution (added v2.1.141)

## Output

All [common output fields](_config.md#common-output-fields) plus, at the top level (not inside `hookSpecificOutput`):

```json
{
  "decision": "block",
  "reason": "Explanation injected as context for Claude",
  "continueOnBlock": true,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "string",
    "updatedToolOutput": { }
  }
}
```

- `decision: "block"` — stops the agentic loop; the tool has already run and its output is already recorded
- `reason` — explanation injected into context for Claude when blocking
- `continueOnBlock: true` — when combined with `decision: "block"`, feeds the rejection reason to Claude and continues the turn instead of halting the entire agentic loop (added v2.1.139)
- `additionalContext` — context injected next to the tool result; visible to Claude
- `updatedToolOutput` — replaces the tool output as seen by Claude; the original output is not shown to Claude (added v2.1.139)

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed |
| 2 | stderr shown to Claude as context; does not block (tool already ran) |
| 1 / other | Non-blocking error; hook output ignored |

## Config example

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/validate-bash-output.sh",
            "if": "Bash(npm *)",
            "timeout": 30,
            "statusMessage": "Validating output..."
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/post-write-lint.sh",
            "if": "Edit(*.ts)",
            "timeout": 60,
            "statusMessage": "Linting..."
          }
        ]
      },
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/audit-log.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

## Notes

- Cannot block tool execution (the tool has already run). `decision: "block"` stops what happens *after* the tool — the agentic loop's next model call.
- `updatedToolOutput` allows post-processing tool results before Claude sees them: filtering sensitive information, reformatting output, or injecting structured annotations.
- `continueOnBlock: true` is useful for soft-stop patterns: halt the current plan, explain why to Claude, and let it decide what to do next — rather than hard-stopping the entire session.
- `duration_ms` does not include permission prompt time or PreToolUse hook time, giving a clean measure of the tool's own execution time.
- When multiple `PostToolUse` hooks run for the same tool call, each receives the original `tool_response`. `updatedToolOutput` from one hook does not affect what subsequent hooks see.
