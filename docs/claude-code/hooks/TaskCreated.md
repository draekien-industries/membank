# TaskCreated

## Trigger

Fires when a task is being created via `TaskCreate`. This hook can block the task creation and roll it back.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Not supported. This event fires for all task creations. Any `matcher` field is silently ignored.

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "TaskCreated",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "task_id": "task_abc123",
  "task_title": "Title of the new task",
  "task_description": "Full description of the task"
}
```

- `task_id` — unique identifier assigned to the task being created
- `task_title` — the short title of the task
- `task_description` — the full description text of the task

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "decision": "block",
  "reason": "Task creation not allowed: description is missing acceptance criteria"
}
```

- `decision: "block"` — task creation is rolled back; the task is not created
- `reason` — message shown to the user explaining why the task was not created

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed |
| 2 | Task creation rolled back; stderr shown to user |
| 1 / other | Non-blocking error; task created normally |

## Config example

```json
{
  "hooks": {
    "TaskCreated": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/validate-task.sh",
            "timeout": 10,
            "statusMessage": "Validating task..."
          }
        ]
      }
    ]
  }
}
```

### Example: require non-empty description

```bash
#!/usr/bin/env bash
INPUT=$(cat)
DESCRIPTION=$(echo "$INPUT" | jq -r '.task_description')

if [ -z "$DESCRIPTION" ]; then
  echo '{"decision":"block","reason":"Task must have a description"}' 
fi
```

## Notes

- This hook fires before the task is committed. `decision: "block"` rolls back the creation entirely.
- Use this hook to enforce task creation policies: required fields, naming conventions, description quality, or workflow constraints.
- `task_id` is provisionally assigned at the time this hook fires. If the task is blocked, this ID is discarded.
