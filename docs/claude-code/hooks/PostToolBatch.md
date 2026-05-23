# PostToolBatch

## Trigger

Fires after all tools in a parallel batch have resolved (whether success or failure), before the next model call. Fires exactly once per batch regardless of how many tools ran in parallel.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Not supported. This event always fires after every tool batch. Any `matcher` field is silently ignored.

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "PostToolBatch",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "tool_calls": [
    {
      "tool_name": "Bash",
      "tool_use_id": "toolu_abc123",
      "tool_input": { },
      "success": true,
      "error": "string",
      "stderr": "string"
    }
  ]
}
```

- `tool_calls` — array of all tool calls that ran in the batch
- `tool_name` — name of the tool
- `tool_use_id` — unique identifier for this tool call
- `tool_input` — input that was passed to the tool
- `success` — `true` if the tool completed without error, `false` if it failed
- `error` — error message if `success` is `false`; empty string otherwise
- `stderr` — stderr output if `success` is `false`; empty string otherwise

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "decision": "block",
  "reason": "string",
  "hookSpecificOutput": {
    "hookEventName": "PostToolBatch",
    "additionalContext": "string"
  }
}
```

- `decision: "block"` — stops the agentic loop before the next model call
- `reason` — explanation for why the loop is being stopped; injected as context for Claude
- `additionalContext` — context injected into the conversation before the next model call

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed |
| 2 | Agentic loop stopped before next model call |
| 1 / other | Non-blocking error; hook output ignored |

## Config example

```json
{
  "hooks": {
    "PostToolBatch": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/post-batch-validator.sh",
            "timeout": 30,
            "statusMessage": "Validating batch results..."
          }
        ]
      }
    ]
  }
}
```

## Notes

- `PostToolBatch` fires once per batch, not once per tool. Use `PostToolUse` or `PostToolUseFailure` if you need per-tool callbacks.
- This hook is the right place for batch-level invariant checks: e.g., verifying that a set of file edits leaves the codebase in a consistent state.
- To block individual tool calls before they run, use `PreToolUse` instead — `PostToolBatch` fires after all tools in the batch have already executed.
- `decision: "block"` stops the agentic loop at the batch boundary. Claude has already seen the tool results; it will not make another model call.
- When multiple tools run in a single batch, all of them appear in `tool_calls` in the order they were initiated.
