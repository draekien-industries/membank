# SessionStart

## Trigger

Fires when a new session is created, or when an existing session is resumed, cleared, or compacted.

## Supported handler types

`command`, `mcp_tool` only. `http`, `prompt`, and `agent` are not supported.

## Matcher

Matches on the `source` field value:

| Matcher | Fires when |
|---|---|
| `"startup"` | New session created |
| `"resume"` | Existing session resumed |
| `"clear"` | Session cleared (`/clear`) |
| `"compact"` | Session compacted |
| `""` / `"*"` / omitted | All of the above |

Pipe-delimited OR is supported: `"startup|resume"`.

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "SessionStart",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "source": "startup|resume|clear|compact",
  "model": "claude-sonnet-4-6"
}
```

- `source` — what triggered the session event
- `model` — the model in use for this session

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "string",
    "initialUserMessage": "string",
    "watchPaths": ["/path/to/watch", "/another/path"]
  }
}
```

- `additionalContext` — injected into Claude's context before the first prompt; not shown to the user
- `initialUserMessage` — the first turn message used in non-interactive (`-p`) mode; ignored in interactive sessions
- `watchPaths` — array of absolute paths Claude should monitor; changes to these paths fire `FileChanged` events

## Environment variables

`CLAUDE_ENV_FILE` is available. Write `KEY=VALUE` lines to this file to persist environment variables into the session.

## Exit code behavior

Exit code 2 is informational — it does not block session startup. stderr may be shown to the user.

## Config example

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/session-init.sh",
            "timeout": 30,
            "statusMessage": "Initializing session..."
          }
        ]
      },
      {
        "matcher": "resume|clear",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/session-restore.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

## Notes

- This hook is the correct place to register `watchPaths` for `FileChanged` events. Paths registered here are monitored for the lifetime of the session.
- `initialUserMessage` is only meaningful in non-interactive (`-p`) mode. In interactive sessions the user types the first message.
- `additionalContext` is injected silently — the user does not see it in the conversation.
- Both `command` and `mcp_tool` handlers receive input via stdin as JSON.
