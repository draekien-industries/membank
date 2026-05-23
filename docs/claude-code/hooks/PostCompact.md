# PostCompact

## Trigger

Fires after context compaction completes successfully. This is an observability hook — it cannot affect compaction behavior.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on the `trigger` field value:

| Matcher | Fires when |
|---|---|
| `"manual"` | Compaction was manually triggered |
| `"auto"` | Compaction was automatically triggered |
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
  "hook_event_name": "PostCompact",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "trigger": "manual|auto"
}
```

- `trigger` — what triggered the compaction that just completed

## Output

Standard [common output fields](_config.md#common-output-fields) only. Non-blocking.

**Important:** `additionalContext` has no effect on this event. After compaction, the context is in a compacted state and new context injections from this hook are not applied to Claude's context window.

## Exit code behavior

Non-blocking. Output and exit codes are ignored for control purposes. This hook is observability-only.

## Config example

```json
{
  "hooks": {
    "PostCompact": [
      {
        "matcher": "auto",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/log-auto-compact.sh",
            "async": true,
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "manual|auto",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:9090/metrics/compaction",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

## Notes

- `additionalContext` output is explicitly noted as having no effect — this is by design. After compaction, the context window has been rebuilt and is not open for additional injection from this hook.
- To inject context after compaction, consider using `SessionStart` with `matcher: "compact"` which fires when a session is restored after compaction, and that hook's `additionalContext` is effective.
- Use this hook for metrics (tracking compaction frequency), logging (recording when context was compacted), or alerting (notifying external systems of major context resets).
- `async: true` is recommended since no synchronous action is useful here.
