# InstructionsLoaded

## Trigger

Fires when a `CLAUDE.md` or `.claude/rules/*.md` instruction file is loaded into the session. This is an audit logging hook — it cannot affect whether instructions are loaded.

## Supported handler types

All handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`.

## Matcher

Matches on the `load_reason` field value:

| Matcher | Fires when |
|---|---|
| `"session_start"` | File loaded at session startup |
| `"nested_traversal"` | File discovered by traversing into a subdirectory |
| `"path_glob_match"` | File loaded because a path glob in the instructions matched |
| `"include"` | File loaded via an `@include` directive in a parent file |
| `"compact"` | File reloaded after context compaction |
| `""` / `"*"` / omitted | All load reasons |

## Default timeout

600 seconds

## Input

All [common input fields](_config.md#common-input-fields) plus:

```json
{
  "session_id": "string",
  "transcript_path": "/absolute/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "InstructionsLoaded",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "effort": { "level": "low|medium|high|xhigh|max" },
  "file_path": "/absolute/path/to/CLAUDE.md",
  "memory_type": "User|Project|Local|Managed",
  "load_reason": "session_start|nested_traversal|path_glob_match|include|compact",
  "globs": ["**/*.ts"],
  "trigger_file_path": "/path/to/the/file/that/triggered/load",
  "parent_file_path": "/path/to/parent/instruction/file"
}
```

- `file_path` — absolute path to the instruction file that was loaded
- `memory_type` — classification of the instruction file:
  - `"User"` — from `~/.claude/`
  - `"Project"` — from `.claude/` (committed)
  - `"Local"` — from `.claude/settings.local.json` context
  - `"Managed"` — from org/admin policy
- `load_reason` — what caused this file to be loaded
- `globs` — present only when `load_reason` is `"path_glob_match"`; the glob patterns that matched
- `trigger_file_path` — present on lazy/glob loads; the file whose path triggered the load
- `parent_file_path` — present when `load_reason` is `"include"`; the file that contained the `@include` directive

## Output

No decision control. Output and exit codes are ignored. This hook is audit logging only.

## Exit code behavior

All exit codes are ignored. Cannot affect instruction loading.

## Config example

```json
{
  "hooks": {
    "InstructionsLoaded": [
      {
        "matcher": "session_start",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/log-instructions.sh",
            "async": true,
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "include",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:9090/audit/instructions",
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

- This hook is purely observational. It cannot block, modify, or redirect instruction loading.
- `async: true` is recommended since no action needs to be taken synchronously.
- Use this hook for compliance auditing (knowing which instruction files influenced a session), debugging (tracking load order), or security monitoring (alerting on unexpected instruction files being loaded).
- The combination of `file_path`, `memory_type`, and `load_reason` gives complete provenance information for each instruction file.
- `globs` is only populated for `"path_glob_match"` loads — it shows which glob pattern in the instructions caused this file to be pulled in.
- `parent_file_path` traces `@include` chains, enabling full include-graph reconstruction.
