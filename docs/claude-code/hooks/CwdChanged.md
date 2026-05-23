# CwdChanged

## Trigger

Fires when the working directory changes during a session — for example, when Claude executes a `cd` command.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Not supported. This event fires for all directory changes. Any `matcher` field is silently ignored.

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/new/current/working/directory",
  "hook_event_name": "CwdChanged",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "old_cwd": "/previous/directory",
  "new_cwd": "/new/directory"
}
```

- `old_cwd` — the directory before the change
- `new_cwd` — the directory after the change (same as `cwd` in common fields)

## Output

Standard [common output fields](_config.md#common-output-fields) only. Non-blocking — output fields have no effect on whether the directory change is applied.

The primary purpose of output here is writing to `CLAUDE_ENV_FILE`.

## Environment variables

`CLAUDE_ENV_FILE` is available. Write `KEY=VALUE` lines to this file to update environment variables in the session after the directory change. This is the primary use case for this hook.

## Exit code behavior

Non-blocking. Exit code and stderr are ignored.

## Config example

```json
{
  "hooks": {
    "CwdChanged": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/direnv-reload.sh",
            "timeout": 10,
            "statusMessage": "Reloading environment..."
          }
        ]
      }
    ]
  }
}
```

### Example: direnv integration

```bash
#!/usr/bin/env bash
# direnv-reload.sh — reload .envrc when changing directories
INPUT=$(cat)
NEW_CWD=$(echo "$INPUT" | jq -r '.new_cwd')

cd "$NEW_CWD" || exit 0

if [ -f ".envrc" ] && command -v direnv &>/dev/null; then
  # Export new env vars to CLAUDE_ENV_FILE
  direnv export bash >> "$CLAUDE_ENV_FILE"
fi
```

## Notes

- The canonical use case is direnv integration: when Claude `cd`s into a directory with a `.envrc`, this hook can evaluate the `.envrc` and write the resulting environment variables to `CLAUDE_ENV_FILE`, making them available in subsequent tool calls.
- `CLAUDE_ENV_FILE` persistence means variables set here survive across the directory change and remain in effect until another `CwdChanged` hook overwrites them or the session ends.
- `new_cwd` and the common `cwd` field carry the same value. `old_cwd` is needed to detect which direction the change went, log history, or diff `.envrc` files.
- Since this hook is non-blocking, it cannot prevent directory changes.
