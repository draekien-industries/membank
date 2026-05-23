# SessionEnd

## Trigger

Fires when a session terminates. This is an observability and cleanup hook — it cannot block session termination.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on the `reason` field value:

| Matcher | Fires when |
|---|---|
| `"clear"` | Session cleared via `/clear` |
| `"resume"` | Session ended because another session was resumed |
| `"logout"` | User logged out |
| `"prompt_input_exit"` | User exited at the prompt input (e.g., Ctrl-D or `/exit`) |
| `"bypass_permissions_disabled"` | Session ended because bypass permissions mode was disabled |
| `"other"` | Any other termination reason |
| `""` / `"*"` / omitted | All end reasons |

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "SessionEnd",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "reason": "clear|resume|logout|prompt_input_exit|bypass_permissions_disabled|other"
}
```

- `reason` — why the session is ending

## Output

Standard [common output fields](_config.md#common-output-fields) only. Non-blocking.

Exit code and stderr are ignored. Output fields have no effect on session termination behavior.

## Exit code behavior

Non-blocking. All exit codes are ignored for control purposes.

## Config example

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "matcher": "prompt_input_exit|logout",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/session-cleanup.sh",
            "async": true,
            "timeout": 30
          }
        ]
      },
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:9090/metrics/session-end",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### Example: save session summary on exit

```bash
#!/usr/bin/env bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
REASON=$(echo "$INPUT" | jq -r '.reason')
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path')

ARCHIVE_DIR="$HOME/.claude/session-archives"
mkdir -p "$ARCHIVE_DIR"

# Copy transcript with session metadata
jq -n \
  --arg id "$SESSION_ID" \
  --arg reason "$REASON" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{session_id: $id, end_reason: $reason, ended_at: $ts}' \
  >> "$ARCHIVE_DIR/sessions.jsonl"

cp "$TRANSCRIPT" "$ARCHIVE_DIR/$SESSION_ID.jsonl" 2>/dev/null || true
```

## Notes

- Session termination cannot be prevented or delayed by this hook. Use it exclusively for cleanup and logging.
- `async: true` is recommended for most session-end handlers to avoid blocking the termination UI — but note that the session may close before long-running async handlers finish.
- `transcript_path` is still valid at the time this hook fires — the transcript file has not been deleted yet. This is the last opportunity to read or archive the full transcript.
- `reason: "clear"` means the user ran `/clear` (which starts a new session); the old session ends with this reason.
- `reason: "resume"` means this session ended because the user resumed a different session.
- `reason: "bypass_permissions_disabled"` indicates a security-relevant termination — consider alerting on this.
