# Stop

## Trigger

Fires when Claude finishes responding and a turn ends normally. This hook can prevent Claude from stopping and force it to continue working.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Not supported. This event always fires at the end of every turn. Any `matcher` field is silently ignored.

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "Stop",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "background_tasks": [
    {
      "task_id": "bg_123",
      "hook_name": "my-async-hook",
      "started_at": "2024-01-15T10:30:00Z",
      "elapsed_ms": 5000
    }
  ],
  "session_crons": [
    {
      "hook_name": "hourly-check",
      "schedule": "0 * * * *",
      "next_run_at": "2024-01-15T11:00:00Z"
    }
  ]
}
```

- `background_tasks` — array of currently running async hooks
  - `task_id` — unique identifier for the background task
  - `hook_name` — name of the hook that launched the async task
  - `started_at` — ISO 8601 timestamp when the task started
  - `elapsed_ms` — milliseconds since the task started
- `session_crons` — array of active cron hooks registered for this session
  - `hook_name` — name of the hook
  - `schedule` — cron expression (e.g., `"0 * * * *"`)
  - `next_run_at` — ISO 8601 timestamp of the next scheduled execution

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "decision": "block",
  "reason": "Continue monitoring build output"
}
```

- `decision: "block"` — prevents Claude from stopping; Claude continues working on the current task
- `reason` — context shown to Claude explaining why it should continue

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed |
| 2 | Claude does not stop responding; stderr fed to Claude as context |
| 1 / other | Non-blocking error; Claude stops normally |

## Config example

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/check-completion.sh",
            "timeout": 30,
            "statusMessage": "Verifying completion..."
          }
        ]
      }
    ]
  }
}
```

### Example: block stop until background task completes

```bash
#!/usr/bin/env bash
# check-completion.sh
INPUT=$(cat)
BACKGROUND_TASKS=$(echo "$INPUT" | jq '.background_tasks | length')

if [ "$BACKGROUND_TASKS" -gt 0 ]; then
  echo '{"decision":"block","reason":"Waiting for background tasks to complete"}'
fi
```

## Notes

- `decision: "block"` is the mechanism for implementing "loop until done" patterns: the Stop hook checks whether conditions are met and blocks the stop until they are.
- The `agent` handler type is supported on this hook. An agent handler can perform multi-step verification work (up to 50 tool turns) before deciding whether Claude should stop.
- `background_tasks` lets the hook detect whether async hooks launched earlier in the session are still running. This is useful for waiting on async side effects before allowing the session to end.
- `session_crons` provides visibility into scheduled hooks but does not affect cron execution — crons continue regardless of whether Claude is stopped.
- `asyncRewake: true` on background tasks combined with this hook creates a pattern where background work can wake Claude to continue after a Stop.
