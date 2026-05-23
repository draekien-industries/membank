# UserPromptSubmit

## Trigger

Fires when the user submits a prompt, before Claude begins processing it. Fires on every prompt submission in both interactive and non-interactive modes.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Not supported. This event always fires on every prompt. Any `matcher` field is silently ignored.

## Default timeout

30 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "UserPromptSubmit",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "prompt": "the full text of the user's submitted prompt"
}
```

- `prompt` — the complete prompt text as submitted by the user

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "decision": "block",
  "reason": "Reason shown to the user when blocking",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "string injected into context without the user seeing it",
    "sessionTitle": "Custom session title string",
    "suppressOriginalPrompt": false
  }
}
```

- `decision: "block"` — prevents the prompt from being processed; the prompt is erased from the conversation
- `reason` — message shown to the user when blocking; only meaningful when `decision` is `"block"`
- `additionalContext` — injected into Claude's context alongside the prompt; not visible to the user
- `sessionTitle` — sets the session title automatically based on the prompt content
- `suppressOriginalPrompt: true` — the original prompt is not sent to Claude; use together with `additionalContext` to fully replace the prompt text

Plain text stdout (non-JSON) on exit code 0 is treated as context added to Claude's context window.

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed; plain stdout added as context |
| 2 | Prompt is blocked and erased; stderr shown to user |
| 1 / other | Non-blocking error; hook output ignored |

## Config example

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/prompt-guard.sh",
            "timeout": 10,
            "statusMessage": "Checking prompt..."
          }
        ]
      }
    ]
  }
}
```

## Notes

- `decision: "block"` takes precedence over `continue: false` if both are present.
- When `suppressOriginalPrompt: true`, the user sees their prompt appear and then be replaced — use `additionalContext` to supply the replacement content Claude should act on.
- This hook is commonly used for prompt injection guards, compliance filtering, automatic context enrichment (e.g., injecting project metadata), and session title automation.
- Because the default timeout is 30 seconds, keep handler logic fast to avoid noticeable latency on every prompt submission.
