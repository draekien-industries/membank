# PreCompact

## Trigger

Fires before context compaction occurs, whether triggered manually by the user or automatically when the context window fills up. This hook can block compaction from happening.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on the `trigger` field value:

| Matcher | Fires when |
|---|---|
| `"manual"` | User manually triggered compaction (e.g., `/compact`) |
| `"auto"` | Claude Code automatically triggered compaction due to context window pressure |
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
  "hook_event_name": "PreCompact",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "trigger": "manual|auto"
}
```

- `trigger` — what triggered the compaction

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "decision": "block",
  "reason": "Active file write in progress — compaction would lose context"
}
```

- `decision: "block"` — compaction does not occur
- `reason` — message shown to the user explaining why compaction was blocked

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed |
| 2 | Compaction does not occur; stderr shown to user |
| 1 / other | Non-blocking error; compaction proceeds normally |

## Config example

```json
{
  "hooks": {
    "PreCompact": [
      {
        "matcher": "auto",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/pre-compact-check.sh",
            "timeout": 10,
            "statusMessage": "Checking compact safety..."
          }
        ]
      },
      {
        "matcher": "manual|auto",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/save-transcript-snapshot.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

### Example: block compaction if in the middle of a multi-step operation

```bash
#!/usr/bin/env bash
INPUT=$(cat)

# Check for a sentinel file indicating an operation is in progress
if [ -f "$CLAUDE_PROJECT_DIR/.claude-operation-in-progress" ]; then
  echo '{"decision":"block","reason":"Multi-step operation in progress — compaction deferred"}'
fi
```

## Notes

- `decision: "block"` on `"auto"` compaction may result in context window overflow if not addressed — use with care.
- Blocking manual compaction (triggered by the user via `/compact`) will prevent the user's explicit intent. Provide a clear `reason` in this case.
- A common pattern is to take a snapshot of the transcript before allowing compaction, using an `async: true` handler for the snapshot and a separate synchronous handler for any blocking logic.
- After compaction (if not blocked), `PostCompact` fires. Note that `additionalContext` from `PostCompact` has no effect since the compacted context does not receive new injections.
