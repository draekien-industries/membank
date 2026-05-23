# Hook: `experimental.session.compacting`

> **Status: EXPERIMENTAL** — This hook's signature and behavior may change between opencode versions without a semver major bump.

## Trigger

Fires before the LLM generates a compaction (continuation) summary — when the context window is near capacity and opencode is about to summarize the conversation to allow the session to continue.

## Call Sites

`packages/opencode/src/session/compaction.ts` — before the compaction LLM call is dispatched.

## Input Type

```typescript
{
  sessionID: string;
}
```

- `sessionID` — the session being compacted.

## Output Type

Mutate in place:

```typescript
{
  context: string[];
  prompt?: string;
}
```

- `context` — additional strings appended to the **default** compaction prompt. Use to inject extra state that should survive compaction (e.g., task status, active file list, in-progress decisions, open TODOs).
- `prompt` — if set, **replaces the default compaction prompt entirely**. When `prompt` is set, `context` is ignored.

## Signature

```typescript
"experimental.session.compacting"?: (input: {
  sessionID: string;
}, output: {
  context: string[];
  prompt?: string;
}) => Promise<void>
```

## Execution Model

- Called sequentially across all loaded plugins, in load order.
- Hook is async-awaited.
- Throwing from this hook propagates through `Effect.promise()` — compaction fails and the session may be unable to continue.
- Multiple plugins can push to `output.context`; all pushed strings are appended in plugin load order.
- If any plugin sets `output.prompt`, all `output.context` additions (from all plugins) are ignored.

## Notes

- The default compaction prompt instructs the LLM to produce a structured summary of the conversation for use as a continuation context. Replacing it via `output.prompt` requires producing a prompt that achieves the same goal — otherwise the compacted session will lose critical state.
- Prefer `output.context.push(...)` over replacing `output.prompt` unless you need full control of the compaction instruction.
- Common `context` additions:
  - Current task list and status (from a task manager).
  - Files actively being modified.
  - Architectural decisions made during the session.
  - Open questions that must not be forgotten.
- The `sessionID` in `input` can be used to query session-specific state (e.g., via `ctx.client`) before constructing the context strings.
- The hook name prefix `experimental.` signals this hook is subject to change.

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const TaskContextPlugin: Plugin = async (ctx) => {
  return {
    "experimental.session.compacting": async (input, output) => {
      // Inject current task state into the compaction summary
      const tasks = await getActiveTasks(input.sessionID)  // hypothetical helper
      if (tasks.length > 0) {
        output.context.push(
          "## Active tasks at time of compaction\n" +
          tasks.map((t) => `- [${t.status}] ${t.title}`).join("\n")
        )
      }
    },
  }
}
```
