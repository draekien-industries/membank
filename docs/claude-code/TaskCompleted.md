# TaskCompleted

## Trigger

Fires when a task is being marked as completed. This hook can block the completion and prevent the task from being marked done.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Not supported. This event fires for all task completions. Any `matcher` field is silently ignored.

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "TaskCompleted",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "task_id": "task_abc123",
  "task_title": "Title of the task being completed"
}
```

- `task_id` — unique identifier of the task being marked complete
- `task_title` — the short title of the task

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "decision": "block",
  "reason": "Tests are still failing — task cannot be marked complete"
}
```

- `decision: "block"` — task is not marked complete; remains in its current state
- `reason` — message shown to the user explaining why completion was blocked

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed |
| 2 | Task not marked complete; stderr shown to user |
| 1 / other | Non-blocking error; task marked complete normally |

## Config example

```json
{
  "hooks": {
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/verify-task-done.sh",
            "timeout": 60,
            "statusMessage": "Verifying completion criteria..."
          }
        ]
      }
    ]
  }
}
```

### Example: block completion if tests fail

```bash
#!/usr/bin/env bash
INPUT=$(cat)
TASK_TITLE=$(echo "$INPUT" | jq -r '.task_title')

if ! pnpm test --silent 2>/dev/null; then
  echo "{\"decision\":\"block\",\"reason\":\"Tests failing for task: $TASK_TITLE\"}"
fi
```

## Notes

- Use this hook to enforce "definition of done" policies: tests passing, linting clean, documentation updated, etc.
- The task title (not just the ID) is available in the input, making it possible to enforce different completion criteria for different task types based on title patterns.
- Blocking completion does not delete or modify the task — it simply remains in its current in-progress state.
- Unlike `TaskCreated`, there is no `task_description` in the input — only the title. If your validation logic needs the description, you would need to correlate via `task_id` with data captured during `TaskCreated`.
