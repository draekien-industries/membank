# Hook: `experimental.chat.messages.transform`

> **Status: EXPERIMENTAL** — This hook's signature and behavior may change between opencode versions without a semver major bump.

## Trigger

Fires in two places:

1. **Before compaction** — transforms the message history fed to the compaction LLM when summarizing a context-full conversation.
2. **In the main agent loop** — transforms message history before building model messages for each LLM call.

## Call Sites

- `packages/opencode/src/session/compaction.ts` — before the compaction LLM receives message history.
- `packages/opencode/src/session/prompt.ts` — before the main agent LLM receives message history.

## Input Type

```typescript
{}
```

The input is an empty object. All mutable state is in the output.

## Output Type

Mutate in place:

```typescript
{
  messages: Array<{
    info: Message;
    parts: Part[];
  }>;
}
```

- `messages` — the full message history array. Each entry contains:
  - `info` — the `Message` metadata object (ID, role, timestamps, session ID, etc.).
  - `parts` — the array of `Part` objects for that message.

Mutations may add, remove, reorder, or modify messages and their parts.

## Signature

```typescript
"experimental.chat.messages.transform"?: (input: {}, output: {
  messages: Array<{
    info: Message;
    parts: Part[];
  }>;
}) => Promise<void>
```

## Execution Model

- Called sequentially across all loaded plugins, in load order.
- Hook is async-awaited.
- Throwing from this hook propagates through `Effect.promise()` — the LLM call or compaction fails.
- Multiple plugins each mutate `output.messages` in sequence; each sees the state left by the previous plugin.

## Notes

- Mutations affect what the LLM sees **but do not persist to the database**. The stored message history is not modified — only the in-memory copy passed to the model is affected.
- Removing messages reduces context and can make the LLM unaware of earlier work. Use with care — the LLM may repeat actions it already took.
- Adding synthetic messages (e.g., injected tool results, system-level annotations as user messages) allows enriching context without permanent storage.
- Reordering messages can confuse the LLM if it disrupts the expected assistant/user/tool alternation pattern. Most providers expect strict role alternation.
- This hook fires on every LLM call, including subagent calls. The `input` does not identify the session — use the `event` hook or closure state to correlate if needed.
- The hook name prefix `experimental.` signals that this hook is subject to change. Pin your plugin to a specific opencode version if you depend on it.

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MessageFilterPlugin: Plugin = async (ctx) => {
  return {
    "experimental.chat.messages.transform": async (input, output) => {
      // Remove messages older than the last 50 to reduce context
      if (output.messages.length > 50) {
        output.messages.splice(0, output.messages.length - 50)
      }
    },
  }
}
```
