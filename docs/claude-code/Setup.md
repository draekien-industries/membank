# Setup

## Trigger

Fires when Claude Code is invoked in setup/maintenance mode:

- `claude --init-only` — triggers with `"init"`
- `claude -p --init` — triggers with `"init"`
- `claude -p --maintenance` — triggers with `"maintenance"`

## Supported handler types

`command`, `mcp_tool` only. `http`, `prompt`, and `agent` are not supported.

## Matcher

Matches on the `trigger` field value:

| Matcher | Fires when |
|---|---|
| `"init"` | `--init-only` or `-p --init` |
| `"maintenance"` | `-p --maintenance` |
| `""` / `"*"` / omitted | Both |

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "Setup",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "trigger": "init|maintenance"
}
```

- `trigger` — which invocation mode caused the hook to fire

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "Setup",
    "additionalContext": "string"
  }
}
```

- `additionalContext` — injected into Claude's context before processing; not shown to the user

## Environment variables

`CLAUDE_ENV_FILE` is available. Write `KEY=VALUE` lines to this file to persist environment variables into the session.

## Exit code behavior

Exit code 2 shows stderr to the user but **cannot block** the Setup process. The setup operation continues regardless of exit code.

## Config example

```json
{
  "hooks": {
    "Setup": [
      {
        "matcher": "init",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/on-init.sh",
            "timeout": 60,
            "statusMessage": "Running initialization..."
          }
        ]
      },
      {
        "matcher": "maintenance",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/on-maintenance.sh",
            "timeout": 120,
            "statusMessage": "Running maintenance..."
          }
        ]
      }
    ]
  }
}
```

## Notes

- Setup hooks run before Claude begins processing in `--init-only` or `--maintenance` mode, making them suitable for environment preparation, dependency checks, and configuration bootstrapping.
- Despite exit code 2 showing stderr to the user, Setup cannot be blocked — this is by design to ensure the init/maintenance workflows always complete.
- `additionalContext` output can inject context that Claude will use during the init or maintenance session.
