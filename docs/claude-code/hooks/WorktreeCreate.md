# WorktreeCreate

## Trigger

Fires when a worktree is being created, triggered by the `--worktree` flag or `isolation: "worktree"` configuration. This hook provides the path where the worktree should be created.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Not supported. This event fires for all worktree creations. Any `matcher` field is silently ignored.

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "WorktreeCreate",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "worktree_name": "feature-branch-abc",
  "base_branch": "main"
}
```

- `worktree_name` — the name assigned to the new worktree
- `base_branch` — the branch the worktree is based on

## Output

The hook returns the absolute path where the worktree should be created. Two output mechanisms are supported depending on handler type:

### command handler — plain text stdout

```
/absolute/path/to/worktree
```

Return the absolute path as plain text on stdout (one line, no JSON wrapper).

### http handler — JSON response body

```json
{
  "hookSpecificOutput": {
    "hookEventName": "WorktreeCreate",
    "worktreePath": "/absolute/path/to/worktree"
  }
}
```

If no path is returned, Claude Code uses its default worktree location.

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; path from stdout used if provided |
| Non-zero (any) | Worktree creation fails entirely |

Any non-zero exit code causes the worktree creation to fail. There is no distinction between "blocking" and "non-blocking" for this event — any failure code aborts creation.

## Config example

```json
{
  "hooks": {
    "WorktreeCreate": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/worktree-path.sh",
            "timeout": 10,
            "statusMessage": "Preparing worktree location..."
          }
        ]
      }
    ]
  }
}
```

### Example: place worktrees in a dedicated directory

```bash
#!/usr/bin/env bash
INPUT=$(cat)
WORKTREE_NAME=$(echo "$INPUT" | jq -r '.worktree_name')
BASE_BRANCH=$(echo "$INPUT" | jq -r '.base_branch')

# Place all worktrees under ~/worktrees/<project>/<branch>
PROJECT=$(basename "$CLAUDE_PROJECT_DIR")
echo "/home/user/worktrees/$PROJECT/$WORKTREE_NAME"
```

## Notes

- If the hook returns no path (empty stdout, exit code 0), Claude Code falls back to its default worktree placement logic.
- The `command` handler uses plain text stdout — not JSON — to return the path. This is an exception to the standard JSON output convention.
- The `http` handler uses the standard JSON response body with `hookSpecificOutput`.
- Any non-zero exit code fails the entire worktree creation operation. There is no "soft fail" here.
- `worktree_name` may include branch name segments with `/` converted to `-` or similar sanitization.
