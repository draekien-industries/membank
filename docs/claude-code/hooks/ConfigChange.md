# ConfigChange

## Trigger

Fires when a configuration file changes during an active session. This hook can block the change from being applied.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on the `source` field value:

| Matcher | Fires when | Blockable |
|---|---|---|
| `"user_settings"` | `~/.claude/settings.json` changes | Yes |
| `"project_settings"` | `.claude/settings.json` changes | Yes |
| `"local_settings"` | `.claude/settings.local.json` changes | Yes |
| `"policy_settings"` | Org policy settings change | No |
| `"skills"` | Skill definitions change | Yes |
| `""` / `"*"` / omitted | All sources | Varies |

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "ConfigChange",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "source": "user_settings|project_settings|local_settings|policy_settings|skills",
  "file_path": "/absolute/path/to/settings.json"
}
```

- `source` — which config source changed
- `file_path` — absolute path to the changed configuration file

## Output

All [common output fields](_config.md#common-output-fields) plus:

```json
{
  "decision": "block",
  "reason": "Config changes require approval during active sessions"
}
```

- `decision: "block"` — the config change is not applied; settings revert to their previous state
- `reason` — message shown to the user explaining why the change was blocked

## Exit code behavior

| Code | Effect |
|---|---|
| 0 | Success; JSON output processed |
| 2 | Config change not applied; stderr shown to user |
| 1 / other | Non-blocking error; config change applied normally |

## Config example

```json
{
  "hooks": {
    "ConfigChange": [
      {
        "matcher": "project_settings|local_settings",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/validate-config-change.sh",
            "timeout": 10,
            "statusMessage": "Validating config change..."
          }
        ]
      },
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/log-config-change.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

## Notes

- `policy_settings` changes cannot be blocked — org-administered policy always takes effect. The hook fires for observability but `decision: "block"` has no effect on policy changes.
- This hook fires on filesystem changes to config files during an active session, not on changes made via Claude Code's built-in config commands.
- Use this hook to enforce config change approval workflows, prevent unauthorized permission escalations, or audit configuration modifications.
- `file_path` gives the actual file path, enabling inspection of the new file contents if needed (e.g., diff against previous version stored elsewhere).
