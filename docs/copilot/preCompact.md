# preCompact

## Overview

Fires immediately before context compaction begins. Use it for notification, logging, or saving a snapshot of the current transcript before the context window is summarized. Cannot prevent compaction.

## Surfaces

| Surface | Supported | Notes |
|---|---|---|
| CLI | Yes | Both `"manual"` and `"auto"` triggers |
| Cloud Agent | Yes | `"auto"` trigger only; manual compaction not available |
| VS Code | Yes | Event name is `PreCompact` (PascalCase) |
| JetBrains | Yes | |

## Trigger

Context compaction is about to start. Compaction can be triggered manually by the user or automatically when the context window approaches its limit.

## Matcher

The `matcher` field applies to the `trigger` value. The value is an anchored regex: `^(?:<pattern>)$`.

### Matcher examples

```json
"matcher": "auto"
```
Fires only on automatic compaction.

```json
"matcher": "manual"
```
Fires only on user-initiated compaction.

```json
"matcher": "manual|auto"
```
Fires on both (equivalent to no matcher).

## Input Shape

### CLI / Cloud Agent (camelCase)

```json
{
  "sessionId": "string",
  "timestamp": 1716470400000,
  "cwd": "/path/to/workspace",
  "transcriptPath": "/path/to/transcript.json",
  "trigger": "manual | auto",
  "customInstructions": "string — any custom compaction instructions active at trigger time"
}
```

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Unique identifier for this session |
| `timestamp` | `number` | Unix timestamp in milliseconds |
| `cwd` | `string` | Working directory at compaction time |
| `transcriptPath` | `string` | Absolute path to the current transcript before compaction |
| `trigger` | `"manual" \| "auto"` | What initiated the compaction |
| `customInstructions` | `string` | Any custom instructions configured for the compaction process |

### VS Code (snake_case)

```json
{
  "hook_event_name": "PreCompact",
  "session_id": "string",
  "timestamp": "2026-05-23T00:00:00.000Z",
  "cwd": "/path/to/workspace",
  "transcript_path": "/path/to/transcript.json",
  "trigger": "manual | auto",
  "custom_instructions": "string"
}
```

| Field | Type | Description |
|---|---|---|
| `hook_event_name` | `"PreCompact"` | Fixed discriminator value |
| `session_id` | `string` | Unique identifier for this session |
| `timestamp` | `string` | ISO 8601 timestamp |
| `cwd` | `string` | Working directory at compaction time |
| `transcript_path` | `string` | Absolute path to the current transcript |
| `trigger` | `"manual" \| "auto"` | What initiated the compaction |
| `custom_instructions` | `string` | Any custom instructions configured for compaction |

## Output Shape

No structured output is processed. This hook is notification-only. Any stdout is ignored.

## Exit Codes

| Exit Code | Behavior |
|---|---|
| `0` | Success; stdout is ignored |
| `2` | Warning logged; compaction proceeds (fail-open) |
| Other non-zero | Logged as failure; compaction proceeds (fail-open) |

VS Code exit code semantics:

| Exit Code | Behavior |
|---|---|
| `0` | Success |
| `2` | Blocking error; shown to model |
| Other non-zero | Non-blocking warning; shown to user |

## Effects

No output fields alter agent behavior. Compaction always proceeds regardless of hook output. Use this hook for:

- Saving a backup copy of the transcript before it is summarized
- Logging when and why compaction was triggered
- Sending a notification that long-running context was compacted
- Archiving `customInstructions` that were active at the time of compaction

## Special Notes

### Cannot prevent compaction

`preCompact` is a notification-only hook. It fires before compaction, but returning any value — including non-zero exit — does not prevent the compaction from occurring. There is no `"deny"` mechanism for this hook.

### `transcriptPath` contains the pre-compaction transcript

The transcript at `transcriptPath` is the full conversation history as it exists immediately before compaction. This is the last opportunity to read the complete uncompressed transcript for archiving or analysis.

### Cloud Agent: `"auto"` only

The Cloud Agent does not support manual compaction. In Cloud Agent environments, `trigger` will always be `"auto"`, and a matcher of `"manual"` will never fire.

### `customInstructions` content

The `customInstructions` field contains whatever compaction instructions were active when compaction triggered. This may be empty if no custom instructions are configured.

## Config Example

### Archive transcript before auto-compaction

```bash
#!/usr/bin/env bash
# scripts/archive-transcript.sh

TRANSCRIPT_PATH="$TRANSCRIPT_PATH"
SESSION_ID="$SESSION_ID"
ARCHIVE_DIR="$HOME/.copilot/archives"

mkdir -p "$ARCHIVE_DIR"
cp "$TRANSCRIPT_PATH" "$ARCHIVE_DIR/${SESSION_ID}-$(date +%Y%m%d-%H%M%S)-pre-compact.json"
exit 0
```

```json
{
  "version": 1,
  "hooks": {
    "preCompact": [
      {
        "type": "command",
        "bash": "./scripts/archive-transcript.sh",
        "env": {
          "TRANSCRIPT_PATH": "{{transcriptPath}}",
          "SESSION_ID": "{{sessionId}}"
        },
        "timeoutSec": 10
      }
    ]
  }
}
```

### Log only auto-triggered compactions

```json
{
  "version": 1,
  "hooks": {
    "preCompact": [
      {
        "type": "command",
        "bash": "jq -c '{ts: .timestamp, trigger: .trigger, session: .sessionId}' >> ~/.copilot/compaction-log.ndjson",
        "matcher": "auto",
        "timeoutSec": 5
      }
    ]
  }
}
```

### Notify on manual compaction

```json
{
  "version": 1,
  "hooks": {
    "preCompact": [
      {
        "type": "command",
        "bash": "osascript -e 'display notification \"Compacting Copilot context...\" with title \"Copilot\"'",
        "matcher": "manual",
        "timeoutSec": 5
      }
    ]
  }
}
```

### VS Code (`.github/hooks/pre-compact.json`)

```json
{
  "version": 1,
  "hooks": {
    "PreCompact": [
      {
        "type": "command",
        "command": "node ./scripts/backup-transcript.js",
        "timeout": 10
      }
    ]
  }
}
```
