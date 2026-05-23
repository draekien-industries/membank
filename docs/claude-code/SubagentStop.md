# SubagentStop

## Trigger

Fires when a subagent finishes its work. This hook can prevent the subagent from stopping and force it to continue, or stop it entirely.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on the `agent_type` field value. Same values as [SubagentStart](SubagentStart.md#matcher).

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "SubagentStop",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "agent_type": "general-purpose",
  "agent_id": "agent_abc123"
}
```

- `agent_type` — type of the subagent that is finishing
- `agent_id` — unique identifier for this subagent instance
- `effort` — effort level used by the subagent (may differ from parent)

Note: `effort` here reflects the subagent's own effort level, which may differ from the parent session's effort level.

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "decision": "block",
  "reason": "Verification not yet complete"
}
```

- `decision: "block"` — prevents the subagent from stopping; it continues working
- `reason` — context injected into the subagent explaining why it should continue
- `continue: false` + `stopReason` — stops the subagent entirely (overrides `decision: "block"`)

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed |
| 2 | Subagent continues working; stderr fed to subagent as context |
| 1 / other | Non-blocking error; subagent stops normally |

## Config example

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "matcher": "general-purpose",
        "hooks": [
          {
            "type": "agent",
            "prompt": "Verify the subagent completed its task successfully: $ARGUMENTS",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

### Example: block subagent stop until tests pass

```bash
#!/usr/bin/env bash
# check-subagent-work.sh
if ! pnpm test --silent 2>/dev/null; then
  echo '{"decision":"block","reason":"Tests are failing. Please fix them before stopping."}'
fi
```

## Notes

- The `agent` handler type is supported here (experimental). An agent handler can perform multi-step verification (up to 50 tool turns) before deciding whether the subagent should stop.
- `decision: "block"` re-enters the subagent's work loop. The `reason` is shown to the subagent as context explaining what still needs to be done.
- `continue: false` with `stopReason` terminates the subagent entirely without re-entering its loop. This is different from `decision: "block"` — use it when the subagent should be killed rather than continued.
- `agent_id` in the input identifies the subagent that is stopping, not the parent agent. Match it against the `agent_id` logged during `SubagentStart` to correlate start/stop events.
