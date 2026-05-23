# Hook: `chat.headers`

## Trigger

Fires on every LLM call, in the same `prepare()` function as `chat.params`, immediately after it. Fires for both primary agent calls and subagent calls.

## Call Sites

`packages/opencode/src/session/llm/request.ts` — `LLMRequestPrep.prepare()`, immediately after `chat.params`.

## Input Type

Identical to `chat.params` input:

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
- `model` — the resolved `Model` object.
- `provider.source` — how the provider was configured.
- `provider.info` — the resolved `Provider` metadata object.
- `provider.options` — provider-specific options from configuration.
- `message` — the `UserMessage` that triggered this LLM call.

## Output Type

Mutate in place:

```typescript
{
  headers: Record<string, string>;
}
```

- `headers` — HTTP headers to merge into the outgoing LLM request.

## Signature

```typescript
"chat.headers"?: (input: {
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
  headers: Record<string, string>;
}) => Promise<void>
```

## Execution Model

- Called sequentially across all loaded plugins, in load order.
- Hook is async-awaited; all plugins run before the request is dispatched.
- Throwing from this hook propagates through `Effect.promise()` — the LLM call fails.
- Headers set by this hook are merged with built-in opencode headers (`x-session-affinity`, `User-Agent`, etc.).

## Precedence

Plugin headers have the **lowest** precedence in the merge order:

1. Model-level `headers` config from `opencode.json` — highest precedence, always wins.
2. Built-in opencode headers (`x-session-affinity`, `User-Agent`, etc.).
3. Plugin `chat.headers` output — lowest precedence.

If a key is set both by a plugin and by model config, the model config value wins. Multiple plugins that set the same key: the last plugin in load order wins (sequential mutation).

## Notes

- Use this hook to inject session correlation IDs, tracing headers, or gateway-specific authentication tokens.
- For Helicone-style LLM observability proxies, inject `Helicone-Session-Id` and related headers here.
- Headers are string values only — non-string values will cause provider SDK errors.
- To conditionally apply headers per provider, inspect `input.provider.info.id`.

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const HeliconePlugin: Plugin = async (ctx, options) => {
  const apiKey = options?.apiKey as string

  return {
    "chat.headers": async (input, output) => {
      output.headers["Helicone-Auth"] = `Bearer ${apiKey}`
      output.headers["Helicone-Session-Id"] = input.sessionID
      output.headers["Helicone-Session-Path"] = `/${input.agent}`
    },
  }
}
```
