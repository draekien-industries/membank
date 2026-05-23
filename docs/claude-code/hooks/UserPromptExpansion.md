# UserPromptExpansion

## Trigger

Fires when a slash command is about to be expanded, before Claude processes the expanded content. Fires for both skill-based slash commands and MCP prompts.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on the command name (without the leading `/`). Empty string or omitted matches all slash commands.

Examples:
- `"commit"` — matches `/commit` only
- `"commit|review"` — matches `/commit` or `/review`
- `""` / omitted — matches all slash commands

## Default timeout

30 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "UserPromptExpansion",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "expansion_type": "slash_command|mcp_prompt",
  "command_name": "the_skill_name",
  "command_args": "arguments passed to the command",
  "command_source": "plugin|skill|builtin|custom",
  "prompt": "/full command text as typed by the user"
}
```

- `expansion_type` — whether the expansion is from a slash command or an MCP prompt
- `command_name` — the name of the command (without `/`)
- `command_args` — any arguments the user appended after the command name
- `command_source` — where the command is defined
- `prompt` — the full text as the user typed it, including `/` prefix and args

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "decision": "block",
  "reason": "string shown to the user",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptExpansion",
    "additionalContext": "string injected into context"
  }
}
```

- `decision: "block"` — cancels the slash command expansion; the command is not executed
- `reason` — message shown to the user when the expansion is blocked
- `additionalContext` — context injected into Claude alongside the expansion; not visible to the user

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed |
| 2 | Expansion cancelled; stderr shown to user |
| 1 / other | Non-blocking error; hook output ignored |

## Config example

```json
{
  "hooks": {
    "UserPromptExpansion": [
      {
        "matcher": "deploy",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/check-deploy-preconditions.sh",
            "timeout": 15,
            "statusMessage": "Checking deploy preconditions..."
          }
        ]
      },
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/log-command-usage.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

## Notes

- This hook fires before the slash command's skill content is injected into the conversation, making it the right place to enforce preconditions for specific commands.
- `command_source` values: `"plugin"` (from an installed plugin), `"skill"` (from `.claude/skills/`), `"builtin"` (Claude Code built-in), `"custom"` (user-defined).
- MCP prompts (from MCP servers) also fire this event with `expansion_type: "mcp_prompt"`.
- The `additionalContext` output can inject context that will be available to Claude during the expanded command execution.
