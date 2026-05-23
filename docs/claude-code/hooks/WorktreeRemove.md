# WorktreeRemove

## Trigger

Fires when a worktree is being removed — at session exit or when a subagent that was using the worktree finishes. This is an observability and cleanup hook.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Not supported. This event fires for all worktree removals. Any `matcher` field is silently ignored.

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "WorktreeRemove",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "worktree_path": "/tmp/worktree-abc123",
  "source_path": "/Users/user/my-project",
  "force": false
}
```

- `worktree_path` — the absolute path of the worktree being removed
- `source_path` — the path of the source project the worktree was based on
- `force` — whether the removal is being forced (e.g., even if there are uncommitted changes)

## Output

No decision control. This hook cannot block or modify the removal.

Standard output fields are available but have no effect on the removal operation.

## Exit code behavior

Failures are logged in debug mode only. Exit code, stdout, and stderr have no effect on the removal operation. This hook is observability-only.

## Config example

```json
{
  "hooks": {
    "WorktreeRemove": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/worktree-cleanup.sh",
            "async": true,
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

### Example: archive worktree diff before removal

```bash
#!/usr/bin/env bash
INPUT=$(cat)
WORKTREE_PATH=$(echo "$INPUT" | jq -r '.worktree_path')
SOURCE_PATH=$(echo "$INPUT" | jq -r '.source_path')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')

ARCHIVE_DIR="$HOME/.claude/worktree-archives"
mkdir -p "$ARCHIVE_DIR"

# Save a patch of any uncommitted changes
cd "$WORKTREE_PATH" && git diff > "$ARCHIVE_DIR/$SESSION_ID.patch" 2>/dev/null || true
```

## Notes

- `async: true` is recommended since hook failures are silently dropped (logged at debug level only).
- `force: true` indicates the worktree is being removed despite potentially having uncommitted changes. This may be worth alerting on or archiving before removal.
- This hook fires just before the worktree is deleted from disk. Content can still be accessed at `worktree_path` during hook execution.
- The hook cannot prevent removal. If you need to block worktree removal under certain conditions, there is no supported mechanism for this.
- Use this hook for post-session cleanup: archiving work, syncing results back to the source project, logging session metrics, or alerting on unexpected worktree states.
