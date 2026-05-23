# Hook: `tool.execute.after`

## Trigger

Fires immediately after a tool completes successfully. Tool invocations that result in an error do **not** trigger this hook — it only fires on successful completion.

## Call Sites

- `packages/opencode/src/session/tools.ts` — built-in tools and MCP tools.
- `packages/opencode/src/session/prompt.ts` — the `task` tool.

## Input Type

```typescript
{
  tool: string;
  sessionID: string;
  callID: string;
  args: any;
}
```

- `tool` — the tool ID. Same values as in `tool.execute.before`.
- `sessionID` — the session in which the tool ran.
- `callID` — the tool call ID from the LLM response.
- `args` — the argument object that was passed to the tool (after any mutations from `tool.execute.before`).

## Output Type

Mutate in place:

```typescript
{
  title: string;
  output: string;
  metadata: any;
}
```

- `title` — the display title shown in the UI for this tool result.
- `output` — the text content of the tool result. **Mutating this changes what the LLM sees as the tool result.** The LLM's subsequent reasoning and actions depend on this value.
- `metadata` — arbitrary metadata associated with the result. Used by the UI and for storage. Structure varies by tool type.

## Signature

```typescript
"tool.execute.after"?: (input: {
  tool: string;
  sessionID: string;
  callID: string;
  args: any;
}, output: {
  title: string;
  output: string;
  metadata: any;
}) => Promise<void>
```

## Execution Model

- Called sequentially across all loaded plugins, in load order.
- Hook is async-awaited.
- Throwing from this hook propagates through `Effect.promise()` — the post-processing fails. The tool did execute; the error occurs during result handling.
- Mutations to `output.output` change what is stored in the message part and what the LLM receives as the tool result.
- Multiple plugins can each mutate `output`; each sees the state left by the previous plugin.

## Notes

- Because this hook only fires on successful completions, it cannot observe failed tool invocations. Use the `event` hook with `event.type === "tool.execute.after"` cautiously — that bus event fires unconditionally.
- Mutating `output.output` is the primary use case: post-process, redact, summarize, or augment the result before the LLM sees it.
- `output.metadata` is plugin-friendly — add arbitrary keys for display in the UI or for downstream hooks.
- `input.args` reflects the final args after any `tool.execute.before` mutations — it is the args that were actually executed.
- The `task` tool's `output.output` contains the subagent's final response text.

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const RedactionPlugin: Plugin = async (ctx) => {
  const SECRET_PATTERN = /(?:password|token|secret)\s*[:=]\s*\S+/gi

  return {
    "tool.execute.after": async (input, output) => {
      // Redact secrets from bash command output before LLM sees it
      if (input.tool === "bash") {
        output.output = output.output.replace(
          SECRET_PATTERN,
          "[REDACTED]"
        )
      }
    },
  }
}
```
