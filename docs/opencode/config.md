# Hook: `config`

## Trigger

Fires once at plugin initialization time, immediately after all plugins are loaded. Called with the fully resolved and merged opencode configuration object.

## Call Sites

Plugin loader — called once per plugin during the plugin initialization phase, before any session or tool activity begins.

## Input Type

```typescript
Config
```

The `Config` object is the merged result of all configuration sources (global config, project config, environment variables). Its shape includes (non-exhaustive):

```typescript
{
  $schema?: string;
  model?: string;
  provider?: Record<string, ProviderConfig>;
  agent?: Record<string, AgentConfig>;
  mcp?: Record<string, McpConfig>;
  plugin?: Array<string | [string, Record<string, unknown>]>;
  keybind?: Record<string, string>;
  // ... additional config fields
}
```

## Output Type

None. The return value is ignored. Mutations to the `input` object (the `Config` argument) take effect directly — the argument is the live config object.

```typescript
void
```

## Signature

```typescript
config?: (input: Config) => Promise<void>
```

## Execution Model

- Called once per plugin per process startup — not per session, not per LLM call.
- Hook is async-awaited; it may perform async operations such as fetching remote config.
- Throwing from this hook propagates through `Effect.promise()` — the plugin initialization fails.
- Mutations to `input` are reflected in the running config because `input` is passed by reference.

## Notes

- This hook is the appropriate place for one-time setup that depends on resolved configuration (e.g., reading API keys declared in config, validating options passed to the plugin).
- Because it fires only once, it is not suitable for per-request configuration injection — use `chat.params` or `chat.headers` for that.
- The `options` argument passed to the plugin function (from the `[string, Record]` tuple in `opencode.json`) is available as the second argument to the plugin function itself, not via this hook.

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async (ctx, options) => {
  let resolvedEndpoint: string

  return {
    config: async (config) => {
      // Read a value from config to configure plugin behavior
      resolvedEndpoint = (options?.endpoint as string) ?? "https://default.example.com"
      // Optionally mutate config — e.g., inject a default model
      if (!config.model) {
        config.model = "anthropic:claude-sonnet-4-5"
      }
    },
  }
}
```
