# Hook: `tool.execute.before`

## Trigger

Fires immediately before any tool is executed. Covers all tool types:

- Built-in tools (`read`, `write`, `bash`, `edit`, `apply_patch`, `glob`, `grep`, etc.)
- MCP tools (any tool registered via an MCP server)
- The `task` tool (subtask delegation to a subagent)

## Call Sites

- `packages/opencode/src/session/tools.ts` — built-in tools and MCP tools.
- `packages/opencode/src/session/prompt.ts` — the `task` tool.

## Input Type

```typescript
{
  tool: string;
  sessionID: string;
  callID: string;
}
```

- `tool` — the tool ID as a string. Examples: `"read"`, `"write"`, `"bash"`, `"edit"`, `"apply_patch"`, `"glob"`, `"grep"`, `"task"`. MCP tool IDs are prefixed by their MCP server name (e.g., `"github__create_issue"`).
- `sessionID` — the session in which the tool was called.
- `callID` — the tool call ID from the LLM response. Matches the call ID in the message part.

## Output Type

Mutate in place:

```typescript
{
  args: any;
}
```

- `args` — the argument object passed to the tool. The shape depends on the tool. Mutating this changes the arguments the tool actually receives.

### Common tool argument shapes

```typescript
// bash tool
{ command: string; timeout?: number; description?: string }

// read tool
{ filePath: string; offset?: number; limit?: number }

// write tool
{ filePath: string; content: string }

// edit tool
{ filePath: string; oldString: string; newString: string; replaceAll?: boolean }

// apply_patch tool
{ patchText: string }  // patchText contains embedded file paths in marker lines

// glob tool
{ pattern: string; path?: string }

// task tool
{ description: string; prompt: string }
```

### `apply_patch` note

The `tool` ID is `"apply_patch"` (not `"patch"`). The `args.patchText` field is a string containing a unified-diff-style patch with embedded file paths in marker lines such as:

```
*** Update File: src/foo.ts
```

There is no top-level `filePath` argument — paths are embedded in the patch text.

## Signature

```typescript
"tool.execute.before"?: (input: {
  tool: string;
  sessionID: string;
  callID: string;
}, output: {
  args: any;
}) => Promise<void>
```

## Execution Model

- Called sequentially across all loaded plugins, in load order.
- Hook is async-awaited.
- **Throwing from this hook ABORTS the tool call.** The error propagates through `Effect.promise()` and is surfaced as a tool failure in the session. The LLM receives a tool error result.
- Mutations to `output.args` are reflected in what the tool actually executes.
- Multiple plugins can each mutate `output.args`; each sees the state left by the previous plugin.

## Notes

- To block a specific tool call, throw an error from this hook. The thrown error message becomes the tool failure reason visible to the LLM.
- MCP tool IDs include the server name prefix. Use `input.tool.startsWith("servername__")` to match MCP tools from a specific server.
- This hook fires regardless of permission status — it runs before permission checks for tools that have them, so both allowed and subsequently-denied tool calls will have already run this hook.
- For argument auditing without modification, read `output.args` and do not mutate it.

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const SafetyPlugin: Plugin = async (ctx) => {
  const BLOCKED_PATTERNS = [/rm\s+-rf/, /sudo/, /curl.*\|.*sh/]

  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        const cmd = (output.args as { command: string }).command
        for (const pattern of BLOCKED_PATTERNS) {
          if (pattern.test(cmd)) {
            throw new Error(`Blocked dangerous command pattern: ${pattern}`)
          }
        }
      }
    },
  }
}
```
