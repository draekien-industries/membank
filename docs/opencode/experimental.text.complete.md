# Hook: `experimental.text.complete`

> **Status: EXPERIMENTAL** — This hook's signature and behavior may change between opencode versions without a semver major bump.

## Trigger

Fires at the end of each text chunk from the LLM stream — specifically on the `text-end` event — after the text part is finalized but before it is marked complete and stored.

## Call Sites

`packages/opencode/src/session/processor.ts` — `handleEvent` handler for the `"text-end"` event.

## Input Type

```typescript
{
  sessionID: string;
  messageID: string;
  partID: string;
}
```

- `sessionID` — the session containing the message.
- `messageID` — the ID of the assistant message being streamed.
- `partID` — the ID of the specific text part that has just completed streaming.

## Output Type

Mutate in place:

```typescript
{
  text: string;
}
```

- `text` — the completed text of the finalized part. Mutating this changes what is stored in the message part and displayed to the user. The LLM does not see this mutation (the LLM already produced the text); it affects storage and display only.

## Signature

```typescript
"experimental.text.complete"?: (input: {
  sessionID: string;
  messageID: string;
  partID: string;
}, output: {
  text: string;
}) => Promise<void>
```

## Execution Model

- Called sequentially across all loaded plugins, in load order.
- Hook is async-awaited.
- Throwing from this hook propagates through `Effect.promise()` — text part finalization fails.
- Fires once per completed text part. A single assistant message may produce multiple text parts (e.g., text before and after a tool call), resulting in multiple firings per message.
- Multiple plugins each mutate `output.text` in sequence; each sees the state left by the previous plugin.

## Notes

- `output.text` is the **completed** text of one streaming part — not the accumulated full message. If the LLM emits multiple text parts interspersed with tool calls, this hook fires once per text part.
- Mutations affect **storage and display only**. The LLM has already produced this text and moved on — mutating it cannot influence the LLM's subsequent reasoning within the same turn.
- This is the correct hook for post-processing assistant output: formatting, redaction, annotation, or translation before storage.
- Because this fires after the text has already been streamed to the UI, the user may have briefly seen the unmodified text before the stored version reflects the mutation. If real-time redaction is required, a streaming-layer hook would be needed (not currently available).
- The hook name prefix `experimental.` signals this hook is subject to change.

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const TextPostProcessPlugin: Plugin = async (ctx) => {
  return {
    "experimental.text.complete": async (input, output) => {
      // Replace any accidentally emitted internal markers
      output.text = output.text
        .replace(/<internal>[^<]*<\/internal>/g, "")
        .trimEnd()
    },
  }
}
```
