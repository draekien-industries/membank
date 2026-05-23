# Hook: `experimental.compaction.autocontinue`

> **Status: EXPERIMENTAL** — This hook's signature and behavior may change between opencode versions without a semver major bump.

## Trigger

Fires after compaction succeeds and before a synthetic "continue" user message is automatically added to resume the agent loop. This synthetic message prompts the LLM to pick up where it left off after the compaction summary has been stored.

## Call Sites

`packages/opencode/src/session/compaction.ts` — after successful compaction, before the auto-continue message is injected.

## Input Type

```typescript
{
  sessionID: string;
  agent: string;
  model: Model;
  provider: ProviderContext;
  message: UserMessage;
  overflow: boolean;
}
```

- `sessionID` — the session that was compacted.
- `agent` — the agent name that was running when compaction triggered.
- `model` — the resolved `Model` that was in use.
- `provider` — the `ProviderContext` object describing the provider configuration.
- `message` — the synthetic `UserMessage` that would be submitted as the auto-continue trigger.
- `overflow` — `true` if compaction was triggered by context window overflow; `false` if triggered by other means (e.g., manual compaction).

## Output Type

Mutate in place:

```typescript
{
  enabled: boolean;
}
```

- `enabled` — controls whether the synthetic auto-continue message is submitted. Default is `true`. Set to `false` to suppress the auto-continue turn, leaving the session paused after compaction.

## Signature

```typescript
"experimental.compaction.autocontinue"?: (input: {
  sessionID: string;
  agent: string;
  model: Model;
  provider: ProviderContext;
  message: UserMessage;
  overflow: boolean;
}, output: {
  enabled: boolean;
}) => Promise<void>
```

## Execution Model

- Called sequentially across all loaded plugins, in load order.
- Hook is async-awaited.
- Throwing from this hook propagates through `Effect.promise()` — auto-continue handling fails. The session may be left in an indeterminate state.
- Multiple plugins can each set `output.enabled`. Last write wins. A plugin that sets `false` can be overridden by a later plugin setting `true`.

## Notes

- When `output.enabled` is set to `false`, the agent loop stops after compaction. The user must manually send a new message to resume.
- The `input.message` is the synthetic "continue" message — it is a pre-constructed `UserMessage`. You can inspect it but cannot modify it via this hook (it is in input, not output). To modify the auto-continue message content, use the `chat.message` hook, which fires when that message is created.
- `input.overflow` distinguishes between compactions triggered by context pressure (`true`) and those triggered by other means. This can be used to apply different behavior — e.g., always auto-continue on overflow but pause on manual compaction.
- Suppressing auto-continue is useful in human-in-the-loop workflows where you want the agent to pause and wait for explicit user direction after a context reset.

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const ManualContinuePlugin: Plugin = async (ctx) => {
  return {
    "experimental.compaction.autocontinue": async (input, output) => {
      // Only auto-continue when triggered by context overflow
      // For manual compaction, pause and wait for user
      if (!input.overflow) {
        output.enabled = false
      }
    },
  }
}
```
