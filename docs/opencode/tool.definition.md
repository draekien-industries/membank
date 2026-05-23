# Hook: `tool.definition`

## Trigger

Fires for each tool in the resolved tool list, just before tool definitions are serialized and sent to the LLM as part of the tools schema. Fires on every LLM call, for every available tool.

## Call Sites

`packages/opencode/src/tool/registry.ts` — inside `ToolRegistry.tools()`.

## Input Type

```typescript
{
  toolID: string;
}
```

- `toolID` — the identifier of the tool whose definition is being prepared. Examples: `"read"`, `"bash"`, `"write"`, `"edit"`, `"apply_patch"`, MCP tool IDs.

## Output Type

Mutate in place:

```typescript
{
  description: string;
  parameters: any;    // Zod schema
}
```

- `description` — the tool description shown to the LLM. Mutating this changes how the LLM understands the tool's purpose.
- `parameters` — the Zod schema defining the tool's parameter shape. The JSON schema sent to the LLM is derived from this Zod schema unless `output.jsonSchema` is explicitly set.

## Signature

```typescript
"tool.definition"?: (input: {
  toolID: string;
}, output: {
  description: string;
  parameters: any;
}) => Promise<void>
```

## Execution Model

- Called sequentially across all loaded plugins, in load order.
- Hook is async-awaited.
- Throwing from this hook propagates through `Effect.promise()` — the LLM call fails (tool list cannot be built).
- Fires once per tool per LLM call. For a session with 20 available tools and 5 LLM calls, this hook fires 100 times across the session.
- Multiple plugins can each mutate the same tool's definition; each sees the state left by the previous plugin.

## Notes

- Mutating `output.description` is the safest and most common use case — guide the LLM to use a tool differently without changing its actual behavior.
- Mutating `output.parameters` changes what arguments the LLM is instructed to provide. Ensure any schema mutation remains compatible with the tool's actual `execute` function, which validates against the original Zod schema.
- This hook applies to all tools: built-in, MCP, and plugin-registered tools.
- Use `input.toolID` to target a specific tool. Avoid mutating all tools indiscriminately.
- JSON schema derivation from `output.parameters` happens after this hook runs. If you need to override the JSON schema directly (bypassing Zod derivation), check whether `output.jsonSchema` is available as an additional output field in the version you are targeting.

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const ToolGuidancePlugin: Plugin = async (ctx) => {
  return {
    "tool.definition": async (input, output) => {
      // Append project-specific guidance to the bash tool description
      if (input.toolID === "bash") {
        output.description =
          output.description +
          "\n\nIMPORTANT: This project uses pnpm, not npm. Always use pnpm for package operations."
      }

      // Narrow the read tool to discourage reading outside the project
      if (input.toolID === "read") {
        output.description =
          output.description +
          "\n\nPrefer reading files within the project directory. Avoid reading system files."
      }
    },
  }
}
```
