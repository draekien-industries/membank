# TeammateIdle

## Trigger

Fires when an agent team teammate is about to go idle. This hook can prevent the teammate from going idle and force it to continue working, or stop it entirely.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Not supported. This event always fires for all teammates. Any `matcher` field is silently ignored.

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "TeammateIdle",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "teammate_type": "string"
}
```

- `teammate_type` — the type identifier for the teammate going idle

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "decision": "block",
  "reason": "Peer review not yet complete"
}
```

- `decision: "block"` — prevents the teammate from going idle; it continues working
- `reason` — context shown to the teammate explaining why it should continue
- `continue: false` + `stopReason` — stops the teammate entirely (overrides `decision: "block"`)

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed |
| 2 | Teammate does not go idle; stderr fed to teammate as context |
| 1 / other | Non-blocking error; teammate goes idle normally |

## Config example

```json
{
  "hooks": {
    "TeammateIdle": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/check-teammate-work.sh",
            "timeout": 30,
            "statusMessage": "Checking teammate work..."
          }
        ]
      }
    ]
  }
}
```

## Notes

- `decision: "block"` re-enters the teammate's work loop with the `reason` as context.
- `continue: false` terminates the teammate entirely rather than re-entering its loop.
- This hook is part of the agent team coordination system. It fires when a teammate has finished its current work and is about to enter an idle/waiting state.
- `teammate_type` identifies which kind of teammate is going idle; unlike `SubagentStop`, there is no `agent_id` — teammates in agent teams are identified by type rather than instance ID.
