# Hook: `chat.params`

## Trigger

Fires on every LLM call, after the system prompt is constructed, just before the streaming request is sent to the provider. Fires for both primary agent calls and subagent calls.

## Call Sites

`packages/opencode/src/session/llm/request.ts` — `LLMRequestPrep.prepare()`.

## Input Type

```typescript
{
  sessionID: string;
  agent: string;
  model: Model;
  provider: {
    source: "env" | "config" | "custom" | "api";
    info: Provider;
    options: Record<string, any>;
  };
  message: UserMessage;
}
```

- `sessionID` — the active session.
- `agent` — the name of the agent making the call.
- `model` — the resolved `Model` object (includes `id`, `name`, `context window`, capability flags, etc.).
- `provider.source` — how the provider was configured: `"env"` (API key from environment), `"config"` (from `opencode.json`), `"custom"` (plugin-registered), `"api"` (API-sourced).
- `provider.info` — the resolved `Provider` metadata object.
- `provider.options` — provider-specific options from configuration.
- `message` — the `UserMessage` that triggered this LLM call.

## Output Type

Mutate in place:

```typescript
{
  temperature: number | undefined;
  topP: number | undefined;
  topK: number | undefined;
  maxOutputTokens: number | undefined;
  options: Record<string, any>;
}
```

- `temperature` — sampling temperature. Set to `undefined` to use provider default.
- `topP` — nucleus sampling. Set to `undefined` to use provider default.
- `topK` — top-k sampling. Set to `undefined` to use provider default.
- `maxOutputTokens` — maximum tokens in the response. Set to `undefined` to use provider default.
- `options` — provider-specific options merged directly into the LLM request payload. Keys are provider-defined (e.g., `stop`, `seed`, `reasoning_effort`).

## Signature

```typescript
"chat.params"?: (input: {
  sessionID: string;
  agent: string;
  model: Model;
  provider: {
    source: "env" | "config" | "custom" | "api";
    info: Provider;
    options: Record<string, any>;
  };
  message: UserMessage;
}, output: {
  temperature: number | undefined;
  topP: number | undefined;
  topK: number | undefined;
  maxOutputTokens: number | undefined;
  options: Record<string, any>;
}) => Promise<void>
```

## Execution Model

- Called sequentially across all loaded plugins, in load order.
- Hook is async-awaited; all plugins run before the request is dispatched.
- Throwing from this hook propagates through `Effect.promise()` — the LLM call fails.
- Mutations to `output` directly control what is sent to the provider. Each subsequent plugin in load order can further override values set by earlier plugins.

## Notes

- `output.options` is merged into the provider request at the lowest level — it passes through directly to the provider SDK. The available keys depend on the provider. Consult provider documentation for valid option names.
- Model-level `headers` config (from `opencode.json`) overrides headers set via the `chat.headers` hook, but does NOT override `output.options` set here.
- Use `input.model` and `input.provider.info` to conditionally apply params only to specific models or providers.
- Setting `temperature: 0` forces deterministic output; this is distinct from leaving it `undefined` (provider default).

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const DeterministicPlugin: Plugin = async (ctx) => {
  return {
    "chat.params": async (input, output) => {
      // Force deterministic output for all calls
      output.temperature = 0

      // Pass a provider-specific option
      if (input.provider.info.id === "openai") {
        output.options.seed = 42
      }
    },
  }
}
```
