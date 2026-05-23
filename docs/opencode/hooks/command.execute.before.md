# Hook: `command.execute.before`

## Trigger

Fires when a slash command is invoked — via `/commandname` in the prompt — just before the command's template is rendered and submitted as a prompt to the LLM.

## Call Sites

`packages/opencode/src/session/prompt.ts` — `command()` function.

## Input Type

```typescript
{
  command: string;
  sessionID: string;
  arguments: string;
}
```

- `command` — the command name, without the leading slash (e.g., `"commit"`, `"review"`).
- `sessionID` — the session in which the command was invoked.
- `arguments` — the raw argument string following the command name (everything after `/commandname `). Empty string if no arguments were provided.

## Output Type

Mutate in place:

```typescript
{
  parts: Part[];
}
```

- `parts` — the message parts that will be submitted to the LLM as the user message. Parts are constructed from the command template after variable substitution. Mutating this array changes what the LLM receives.

### `Part` shape (representative)

```typescript
// Text content
{ type: "text"; text: string }

// File attachment
{ type: "file"; mediaType: string; filename: string; url: string }
```

## Signature

```typescript
"command.execute.before"?: (input: {
  command: string;
  sessionID: string;
  arguments: string;
}, output: {
  parts: Part[];
}) => Promise<void>
```

## Execution Model

- Called sequentially across all loaded plugins, in load order.
- Hook is async-awaited.
- Throwing from this hook propagates through `Effect.promise()` — the command execution fails and no message is submitted.
- Mutations to `output.parts` are reflected in what is saved to the database and sent to the LLM.
- Multiple plugins can each mutate `output.parts`; each sees the state left by the previous plugin.

## Notes

- The hook fires after template rendering and variable substitution. The `output.parts` array reflects the fully rendered command output, not the raw template.
- To prepend or append context to a command, push to or unshift onto `output.parts`.
- To intercept and replace a command's output entirely, replace `output.parts` with a new array.
- `input.arguments` contains the raw argument string as typed by the user. Parse it yourself if structured argument handling is needed.
- This hook does not fire for regular (non-slash-command) message submissions — use `chat.message` for those.

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const CommandAuditPlugin: Plugin = async (ctx) => {
  return {
    "command.execute.before": async (input, output) => {
      // Append session metadata to every slash command submission
      if (input.command === "commit") {
        output.parts.push({
          type: "text",
          text: `\n\n[Invoked at: ${new Date().toISOString()}]`,
        })
      }
    },
  }
}
```
