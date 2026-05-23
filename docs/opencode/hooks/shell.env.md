# Hook: `shell.env`

## Trigger

Fires before any shell process is started. Fires in three distinct contexts:

1. The AI `bash` tool executing a shell command.
2. The interactive terminal (PTY) session opened in the TUI.
3. Shell execution in the session prompt for subshell commands.

## Call Sites

- `packages/opencode/src/tool/shell.ts` — `bash` tool execution (context 1).
- `packages/opencode/src/pty/index.ts` — interactive PTY session (context 2).
- `packages/opencode/src/session/prompt.ts` — session prompt subshell (context 3).

## Input Type

```typescript
{
  cwd: string;
  sessionID?: string;
  callID?: string;
}
```

- `cwd` — the current working directory of the shell process being started.
- `sessionID` — present for bash tool (context 1) and session prompt (context 3); **absent** for interactive PTY (context 2).
- `callID` — present for bash tool (context 1) only; the tool call ID from the LLM. Absent in PTY and session prompt contexts.

### Context identification

| Context | `sessionID` | `callID` |
|---------|-------------|----------|
| `bash` tool | present | present |
| PTY session | absent | absent |
| session prompt subshell | present | absent |

## Output Type

Mutate in place:

```typescript
{
  env: Record<string, string>;
}
```

- `env` — key-value pairs to inject into the shell process environment. Merged on top of `process.env`.

## Signature

```typescript
"shell.env"?: (input: {
  cwd: string;
  sessionID?: string;
  callID?: string;
}, output: {
  env: Record<string, string>;
}) => Promise<void>
```

## Execution Model

- Called sequentially across all loaded plugins, in load order.
- Hook is async-awaited; all plugins run before the shell process starts.
- Throwing from this hook propagates through `Effect.promise()` — the shell process is not started.
- Mutations from multiple plugins are merged sequentially. Last write wins for any given key.

## Notes

- `output.env` is **merged on top of** `process.env` — it does not replace the environment. Existing environment variables remain unless explicitly overridden.
- Setting a key to `undefined` does **not** unset the variable. To clear a variable, set it to an empty string (`""`). To truly unset it, the shell process itself must handle unsetting — the hook cannot remove keys from `process.env`.
- All values must be strings. Non-string values will cause type errors or unexpected behavior in the shell process.
- To scope injected vars to only the `bash` tool (not the interactive terminal), check that `input.callID` is present.
- To scope to only the interactive PTY, check that both `input.sessionID` and `input.callID` are absent.

## Example

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const EnvPlugin: Plugin = async (ctx, options) => {
  const projectToken = options?.projectToken as string

  return {
    "shell.env": async (input, output) => {
      // Inject a project token into all shell contexts
      output.env["MY_PROJECT_TOKEN"] = projectToken

      // Inject a session-scoped var only for AI bash tool calls
      if (input.sessionID && input.callID) {
        output.env["OPENCODE_SESSION_ID"] = input.sessionID
        output.env["OPENCODE_CALL_ID"] = input.callID
      }

      // Set working directory context
      output.env["PROJECT_ROOT"] = input.cwd
    },
  }
}
```
