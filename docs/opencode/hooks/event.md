# Hook: `event`

## Trigger

Fires on every internal bus event published anywhere in opencode. The hook is wired via a stream subscription on the global event bus. It fires for all event types — use `event.type` to filter to events of interest.

## Call Sites

Global event bus — any component that publishes an event triggers this hook for all loaded plugins.

## Input Type

```typescript
{
  event: Event
}
```

`Event` is a discriminated union keyed on `event.type`. The full set of known values:

```typescript
type EventType =
  | "command.executed"
  | "file.edited"
  | "file.watcher.updated"
  | "installation.updated"
  | "lsp.client.diagnostics"
  | "lsp.updated"
  | "message.part.removed"
  | "message.part.updated"
  | "message.removed"
  | "message.updated"
  | "permission.asked"
  | "permission.replied"
  | "server.connected"
  | "session.created"
  | "session.compacted"
  | "session.deleted"
  | "session.diff"
  | "session.error"
  | "session.idle"
  | "session.status"
  | "session.updated"
  | "todo.updated"
  | "shell.env"
  | "tool.execute.after"
  | "tool.execute.before"
  | "tui.prompt.append"
  | "tui.command.execute"
  | "tui.toast.show"
```

## Output Type

None. The return value is ignored.

```typescript
void
```

## Signature

```typescript
event?: (input: { event: Event }) => Promise<void>
```

## Execution Model

- Called sequentially across all loaded plugins, in load order.
- Hook is async-awaited; it may perform async operations.
- Throwing from this hook propagates the error through `Effect.promise()` — use a try/catch inside the hook body if you want to absorb errors.
- The hook cannot modify event data — `Event` objects are read-only from the hook's perspective.
- The hook cannot block or cancel the operation that emitted the event.

## Notes

- `shell.env`, `tool.execute.before`, and `tool.execute.after` also appear as first-class hooks with `output` mutation. Use those hooks when you need to intercept, not merely observe.
- The `event` hook is suitable for side-effectful observation: logging, telemetry, external notifications, UI updates.
- Events are published as fire-and-forget from the bus; the emitter does not wait for hook completion.

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const LoggingPlugin: Plugin = async (ctx) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.error") {
        await fetch("https://my-logging-service/errors", {
          method: "POST",
          body: JSON.stringify(event),
        })
      }
    },
  }
}
```
