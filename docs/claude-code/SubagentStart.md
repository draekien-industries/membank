# SubagentStart

## Trigger

Fires when a subagent is spawned. Cannot block subagent startup — this is an observability and context-injection hook.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on the `agent_type` field value:

| Matcher | Fires when |
|---|---|
| `"general-purpose"` | A general-purpose subagent is spawned |
| `"Explore"` | An Explore-type subagent is spawned |
| `"Plan"` | A Plan-type subagent is spawned |
| Custom name | A named custom agent type is spawned |
| `""` / `"*"` / omitted | All agent types |

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "SubagentStart",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "agent_type": "general-purpose",
  "agent_id": "agent_abc123",
  "prompt": "the prompt the subagent was given"
}
```

- `agent_type` — type of subagent being started
- `agent_id` — unique identifier for this subagent instance
- `prompt` — the prompt or task description the subagent will act on

## Output

Standard [common output fields](_config.md#common-output-fields) plus via `hookSpecificOutput`:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SubagentStart",
    "additionalContext": "string injected into subagent context"
  }
}
```

- `additionalContext` — context injected into the subagent's context at startup; not visible to the user

Cannot block subagent startup. Exit code 2 shows stderr to the user only.

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; `additionalContext` injected if provided |
| 2 | Cannot block; stderr shown to user |
| 1 / other | Non-blocking error |

## Config example

```json
{
  "hooks": {
    "SubagentStart": [
      {
        "matcher": "general-purpose",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/inject-subagent-context.sh",
            "timeout": 10,
            "statusMessage": "Preparing subagent..."
          }
        ]
      },
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/log-subagent-spawn.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

## Notes

- `agent_id` is unique per subagent instance and matches the `agent_id` field that appears in the common input fields of all subsequent hooks fired by that subagent.
- `additionalContext` is the primary useful output from this hook — use it to inject per-agent instructions, environment information, or task-specific context that the parent prompt didn't include.
- This hook fires in the parent agent's context. The `agent_id` in common input fields identifies the parent; the `agent_id` in the event-specific fields identifies the child being spawned.
- Cannot block: if you need to prevent subagent spawning, use `PreToolUse` with matcher `"Agent"`.
