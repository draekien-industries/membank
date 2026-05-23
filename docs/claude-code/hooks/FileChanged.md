# FileChanged

## Trigger

Fires when a watched file changes on disk. Files must first be registered for watching via the `watchPaths` field in a `SessionStart` hook output. Changes to files not in `watchPaths` never fire this event.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on the literal filename (last path component), not the full path, and not a regex.

- `".envrc"` — matches any `.envrc` file change in any watched directory
- `".envrc|.env"` — matches either `.envrc` or `.env`
- `""` / `"*"` / omitted — matches all watched file changes

Note: matcher values for this event are always interpreted as literals or pipe-delimited literal lists. Regex characters are not supported — unlike most other events.

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "FileChanged",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "file_path": "/absolute/path/to/changed.file",
  "change_type": "created|modified|deleted"
}
```

- `file_path` — absolute path of the file that changed
- `change_type` — what happened to the file:
  - `"created"` — file was newly created
  - `"modified"` — file content or metadata was modified
  - `"deleted"` — file was deleted

## Output

Standard [common output fields](_config.md#common-output-fields) only. Non-blocking.

The primary purpose of output here is writing to `CLAUDE_ENV_FILE`.

## Environment variables

`CLAUDE_ENV_FILE` is available. Write `KEY=VALUE` lines to this file to update environment variables in the session in response to the file change.

## Exit code behavior

Non-blocking. Exit code and stderr are ignored.

## Registering watch paths

Watch paths are registered in `SessionStart` hook output:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "watchPaths": [
      "/home/user/project",
      "/home/user/project/.envrc"
    ]
  }
}
```

`watchPaths` accepts directories (watch all files recursively) or specific file paths.

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
            "command": "/home/user/.claude/hooks/register-watchers.sh"
          }
        ]
      }
    ],
    "FileChanged": [
      {
        "matcher": ".envrc",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/reload-envrc.sh",
            "timeout": 10,
            "statusMessage": "Reloading .envrc..."
          }
        ]
      },
      {
        "matcher": "package.json",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/notify-package-change.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

### register-watchers.sh output example

```bash
#!/usr/bin/env bash
PROJECT_DIR="$CLAUDE_PROJECT_DIR"
echo "{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"watchPaths\":[\"$PROJECT_DIR\"]}}"
```

### reload-envrc.sh example

```bash
#!/usr/bin/env bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path')
CHANGE_TYPE=$(echo "$INPUT" | jq -r '.change_type')

if [ "$CHANGE_TYPE" != "deleted" ] && command -v direnv &>/dev/null; then
  direnv export bash >> "$CLAUDE_ENV_FILE"
fi
```

## Notes

- Files must be in `watchPaths` (set during `SessionStart`) to trigger this event. There is no way to add watch paths after session start.
- The matcher is literal filename matching only — not full path, not regex. To distinguish `/project-a/.envrc` from `/project-b/.envrc`, use `file_path` from the input JSON.
- `watchPaths` can include directories (watches recursively) or specific file paths.
- This hook and `CwdChanged` are the two hooks with `CLAUDE_ENV_FILE` access, making them the natural integration points for environment management systems like direnv.
- `change_type: "deleted"` fires when a watched file is removed. Handle this case explicitly to avoid errors in scripts that try to read the deleted file.
