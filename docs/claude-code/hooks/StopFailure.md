# StopFailure

## Trigger

Fires when a turn ends due to an API error rather than normal completion. This is an observability hook — it cannot affect Claude's behavior.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on the `error_type` field value:

| Matcher | Fires when |
|---|---|
| `"rate_limit"` | API rate limit hit |
| `"authentication_failed"` | Authentication error |
| `"oauth_org_not_allowed"` | OAuth organization not permitted |
| `"billing_error"` | Billing or payment error |
| `"invalid_request"` | Malformed or invalid API request |
| `"model_not_found"` | Requested model not available |
| `"server_error"` | API server-side error |
| `"max_output_tokens"` | Response exceeded max output tokens |
| `"unknown"` | Unclassified error |
| `""` / `"*"` / omitted | All error types |

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "StopFailure",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "error_type": "rate_limit|authentication_failed|oauth_org_not_allowed|billing_error|invalid_request|model_not_found|server_error|max_output_tokens|unknown",
  "error_message": "human-readable error description"
}
```

- `error_type` — categorized error type
- `error_message` — the raw error message from the API

## Output

Output and exit codes are ignored. This hook is observability-only.

## Exit code behavior

All exit codes are ignored. Cannot affect behavior.

## Config example

```json
{
  "hooks": {
    "StopFailure": [
      {
        "matcher": "rate_limit",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/notify-rate-limit.sh",
            "async": true,
            "timeout": 10
          }
        ]
      },
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:9090/metrics/api-errors",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### Example: desktop notification on rate limit

```bash
#!/usr/bin/env bash
INPUT=$(cat)
ERROR_TYPE=$(echo "$INPUT" | jq -r '.error_type')
ERROR_MESSAGE=$(echo "$INPUT" | jq -r '.error_message')
# macOS
osascript -e "display notification \"$ERROR_TYPE: $ERROR_MESSAGE\" with title \"Claude Code Error\""
```

## Notes

- This hook is purely observational. It exists to support logging, metrics, alerting, and debugging workflows.
- `async: true` is recommended since no action can be taken based on this hook's output.
- Use the matcher to handle specific error types differently — e.g., alerting more urgently on billing errors vs. silently logging rate limits.
- `error_message` contains the raw API error message and may include request IDs or other diagnostic information useful for support tickets.
