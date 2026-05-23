# Hook: `permission.ask`

## Trigger

Fires when the permission system reaches an "ask" decision — after evaluating all configured allow/deny rules — and needs user confirmation before a tool call can proceed. Fired as a bus event (`permission.asked`).

## Call Sites

Permission system — when a tool call requires a permission that is neither pre-allowed nor pre-denied by configured rules.

## Input Type

`Permission.Request` structure:

```typescript
{
  id: PermissionID;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
  tool?: {
    messageID: string;
    callID: string;
  };
}
```

- `id` — unique identifier for this permission request.
- `sessionID` — the session that triggered the permission check.
- `permission` — the permission type being requested, e.g. `"bash"`, `"read"`, `"write"`.
- `patterns` — the glob patterns or path patterns associated with this request (e.g., file paths for `"write"`, command patterns for `"bash"`).
- `metadata` — additional context from the tool that requested permission. Contents vary by tool type.
- `always` — list of patterns that are always allowed (from existing config rules).
- `tool` — present when permission was triggered by a specific tool call; contains `messageID` and `callID` for correlation.

## Output Type

Mutate in place:

```typescript
{
  status: "ask" | "deny" | "allow";
}
```

- `"ask"` — default; the permission UI will prompt the user.
- `"allow"` — plugin pre-approves the request; user is not prompted.
- `"deny"` — plugin pre-denies the request; the tool call is blocked.

## Signature

```typescript
"permission.ask"?: (input: Permission, output: {
  status: "ask" | "deny" | "allow";
}) => Promise<void>
```

## Execution Model

- Called sequentially across all loaded plugins, in load order.
- Hook is async-awaited.
- Throwing from this hook propagates through `Effect.promise()` — the permission check fails and the tool call is aborted.
- Multiple plugins can each mutate `output.status`. Last write wins (sequential execution). A plugin that sets `"allow"` can be overridden by a later plugin setting `"deny"`.
- The initial value of `output.status` is `"ask"` when the hook fires.

## Notes

- This hook is only invoked when the permission system has already determined it cannot auto-approve or auto-deny via static rules. It sits between the rules engine and the interactive UI prompt.
- Setting `output.status = "allow"` is equivalent to the user clicking "Allow once" — it does not persist a rule.
- Use `input.permission` to gate logic by permission type, and `input.patterns` to inspect what resource is being accessed.
- For automated/headless environments where interactive prompts are undesirable, set `output.status = "allow"` unconditionally (with appropriate security consideration) or implement a policy based on `input.patterns`.

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const AutoApproveReadPlugin: Plugin = async (ctx) => {
  return {
    "permission.ask": async (input, output) => {
      // Auto-approve read permissions for files under /tmp
      if (
        input.permission === "read" &&
        input.patterns.every((p) => p.startsWith("/tmp/"))
      ) {
        output.status = "allow"
      }
    },
  }
}
```
