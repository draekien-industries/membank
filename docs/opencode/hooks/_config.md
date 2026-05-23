# OpenCode Plugin Architecture

## Plugin System

OpenCode uses a TypeScript plugin system. Plugins are async JavaScript/TypeScript modules — NOT shell scripts. There is no stdin/stdout JSON protocol, no exit codes, and no `hook` key in `opencode.json`.

## Registration Methods

### npm packages via `opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-helicone-session",
    ["my-plugin", { "optionKey": "optionValue" }]
  ]
}
```

- Plain string: npm package specifier.
- `[string, Record<string, unknown>]` tuple: package specifier plus options object passed to the plugin function as the second argument.

### File-based (auto-loaded)

```
.opencode/plugins/*.{ts,js}              # project-level
~/.config/opencode/plugins/*.{ts,js}     # global
```

Files matching these globs are loaded automatically without any `opencode.json` entry.

### Load Order

Hooks run in this order across all registered plugins:

1. Global config npm plugins (in array order)
2. Project config npm plugins (in array order)
3. Global plugin directory (sorted by filename)
4. Project plugin directory (sorted by filename)

## Plugin Function Signature

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async (ctx, options?) => {
  // ctx fields:
  // ctx.client       — opencode SDK client instance
  // ctx.project      — { id, ... } — the active project
  // ctx.directory    — string — active working directory
  // ctx.worktree     — string — git worktree root
  // ctx.$            — Bun shell tagged template function
  // ctx.serverUrl    — string — URL of the running opencode HTTP server
  // ctx.experimental_workspace — { register(type, adapter) }

  return {
    // Hook implementations (see individual hook docs)
  }
}
```

### Module Export Shapes

- **v1**: export a bare `Plugin` function as a named or default export.
- **v2**: export `{ server: Plugin }` — allows co-locating a `tui` export (see TUI section).

## Hook Execution Model

- All hooks are called **sequentially** across all loaded plugins, in load order.
- Each hook receives `(input, output)` where `output` is mutated in place.
- The runtime awaits the return value — hooks may be sync or async.
- If a hook throws, the error propagates through `Effect.promise()` — the calling operation **fails**. There is no catch wrapper around individual hook invocations.
- There is no per-hook timeout.
- Hooks that return `void` (no output parameter) cannot influence the calling operation; they are for observation only.

## Tool Registration

Plugins can register new tools via the `tool()` helper returned from the plugin context:

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async (ctx) => {
  return {
    tool: [
      {
        id: "my_tool",
        description: "Does something useful",
        parameters: z.object({
          input: z.string().describe("The input value"),
        }),
        execute: async (args, toolCtx) => {
          // toolCtx.sessionID  — current session
          // toolCtx.callID     — tool call ID from the LLM
          // toolCtx.abort      — AbortSignal
          return {
            title: "My Tool Result",
            output: "result text shown to LLM",
            metadata: {},
          }
        },
      },
    ],
  }
}
```

### `ToolDefinition` shape

```typescript
{
  id: string;
  description: string;
  parameters: ZodSchema;
  execute: (args: inferred, ctx: ToolContext) => Promise<ToolResult>;
}
```

### `ToolContext` shape

```typescript
{
  sessionID: string;
  callID: string;
  abort: AbortSignal;
}
```

### `ToolResult` shape

```typescript
{
  title: string;
  output: string;
  metadata: any;
}
```

## Auth Registration

Plugins can register custom auth providers by returning an `auth` array:

```typescript
return {
  auth: [
    {
      id: "my-provider",
      // provider-specific auth fields
    },
  ],
}
```

Auth providers integrate with opencode's credential management and are available to model providers that reference them.

## Provider Hook

Plugins can override or extend the list of models available for a provider by returning a `provider` hook:

```typescript
return {
  provider: async (providerID, models) => {
    // providerID — string identifying the provider (e.g. "anthropic", "openai")
    // models     — current resolved model list
    // Return a modified model list
    return models
  },
}
```

This runs after the default model list is resolved and allows plugins to add, remove, or modify model entries.

## TUI Plugin System

The TUI (terminal UI) layer supports a separate plugin type for extending the terminal interface. TUI plugins run in the TUI process (not the server process) and have access to the terminal rendering context.

### `TuiPlugin` type

```typescript
import type { TuiPlugin } from "@opencode-ai/plugin"

export const MyTuiPlugin: TuiPlugin = async (tuiCtx) => {
  // tuiCtx — TUI-specific context
  return {
    // TUI hook implementations
  }
}
```

### v2 module export shape (server + TUI co-located)

```typescript
export const server: Plugin = async (ctx) => { ... }
export const tui: TuiPlugin = async (tuiCtx) => { ... }
```

Or as a single named export object:

```typescript
export default {
  server: MyPlugin,
  tui: MyTuiPlugin,
}
```

The `server` plugin runs in the opencode server process. The `tui` plugin runs in the TUI process. They communicate via the opencode event bus or HTTP API (`ctx.serverUrl`).
