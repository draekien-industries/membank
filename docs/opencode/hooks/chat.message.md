# Hook: `chat.message`

## Trigger

Fires after a user message is constructed and all its parts are resolved — file references expanded, MCP resources fetched, agent attachments included — just before the message is saved to the database. Fires on every user message submission.

## Call Sites

`packages/opencode/src/session/prompt.ts` — `createUserMessage()` function.

## Input Type

```typescript
{
  sessionID: string;
  agent?: string;
  model?: {
    providerID: string;
    modelID: string;
  };
  messageID?: string;
  variant?: string;
}
```

- `sessionID` — the session the message belongs to.
- `agent` — the agent name, if the message targets a specific agent.
- `model` — the resolved model, if one was selected at message construction time.
- `messageID` — the message ID, if already assigned.
- `variant` — variant identifier, if the message is a variant of an existing message.

## Output Type

Mutate in place:

```typescript
{
  message: UserMessage;
  parts: Part[];
}
```

- `message` — the `UserMessage` metadata object.
- `parts` — the array of message parts that will be saved. Add, remove, or modify parts here to change what is persisted and subsequently sent to the LLM.

### `Part` shape (representative)

Parts are typed objects. Common part types include:

```typescript
// Text content
{ type: "text"; text: string }

// File attachment
{ type: "file"; mediaType: string; filename: string; url: string }

// Tool result (rare in user messages)
{ type: "tool-result"; toolCallId: string; content: string }
```

## Signature

```typescript
"chat.message"?: (input: {
  sessionID: string;
  agent?: string;
  model?: { providerID: string; modelID: string };
  messageID?: string;
  variant?: string;
}, output: {
  message: UserMessage;
  parts: Part[];
}) => Promise<void>
```

## Execution Model

- Called sequentially across all loaded plugins, in load order.
- Hook is async-awaited.
- Throwing from this hook propagates through `Effect.promise()` — message construction and the entire submission fail.
- Cannot block or cancel submission by returning early — throw to abort.
- Parts mutations are reflected in what is saved to the database and sent to the LLM.

## Notes

- This hook fires after all built-in part resolution (file expansions, MCP resources). Plugin mutations therefore supplement, not replace, the resolved parts unless the plugin explicitly splices the array.
- Modifying `output.message` allows changing message-level metadata (e.g., `role`, timestamps) before persistence.
- To add a file attachment programmatically, push a `{ type: "file", ... }` part to `output.parts`.
- The hook does not fire for assistant messages — only user messages constructed via `createUserMessage()`.

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MessageAuditPlugin: Plugin = async (ctx) => {
  return {
    "chat.message": async (input, output) => {
      // Append a context note to every user message
      output.parts.push({
        type: "text",
        text: `\n\n[session: ${input.sessionID}, sent at: ${new Date().toISOString()}]`,
      })
    },
  }
}
```
