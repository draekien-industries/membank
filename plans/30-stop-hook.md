# Plan: #30 — Stop hook for session-end memory capture

## Issue

The `inject.ts` command and `injection-hook-writer.ts` configure only `SessionStart` and `UserPromptSubmit` injection hooks. There is no Stop/session-end hook to capture memories when a session ends.

## Verification

1. **inject.ts event handling** (packages/cli/src/commands/inject.ts:93-108):
   - `handleEvent()` at lines 78-91 builds context text and outputs it based on eventName
   - `injectCommand()` at lines 93-108 has a switch (via if-chain) on `opts.event`:
     - Line 98-100: `"session-start"` → calls `handleEvent(harness, "SessionStart")`
     - Line 102-104: `"user-prompt-submit"` → calls `handleEvent(harness, "UserPromptSubmit")`
     - Line 106-107: Unknown/legacy events → no-op silently
   - No branch for session-end/stop events exists

2. **injection-hook-writer.ts hook configuration** (packages/cli/src/setup/injection-hook-writer.ts):
   
   **Claude Code** (lines 99-176):
   - Config file: `~/.claude/settings.json` (line 101)
   - Hook structure: Nested groups with `matcher` and `hooks` array (lines 142-152)
   - Events inspected: `SessionStart` (lines 105-107), `UserPromptSubmit` (lines 109-111)
   - No `Stop` event defined
   
   **Copilot CLI** (lines 178-247):
   - Config file: `~/.copilot/settings.json` (line 180)
   - Hook structure: Flat array format (type, bash, timeoutSec) (lines 218-225)
   - Events inspected: `sessionStart` (lines 184-187), `userPromptSubmitted` (lines 185-187)
   - No `sessionEnd` or equivalent defined
   
   **Codex** (lines 249-327):
   - Config file: `~/.codex/hooks.json` (line 251)
   - Hook structure: Nested groups like Claude Code (lines 295-304)
   - Events inspected: `SessionStart` (lines 255-257), `UserPromptSubmit` (lines 259-261)
   - No `Stop` event defined
   
   **OpenCode** (lines 329-360):
   - Plugin file: `~/.config/opencode/plugins/membank.js` (line 331)
   - Hook structure: JavaScript object with hooks (lines 366-369)
   - Events supported: Only `"session.start"` currently (line 366)
   - No session-end hook defined

3. **setup-orchestrator.ts hook setup flow** (packages/cli/src/setup/setup-orchestrator.ts:269-323):
   - Lines 269-323: `#runHookSetup()` iterates detected harnesses
   - Lines 278-281: Calls `w.inspect(h.name)` for each harness
   - Lines 285-303: For each hook in `inspected.hooks`, prompts user to configure
   - Line 307: Calls `w.write(h.name, toWrite)` with array of event names to write
   - Setup is generic; it will work for new Stop events once they're added to inspectors

4. **InjectionHookWriter.inspect() contract** (lines 383-387):
   - Returns hooks array with `{ event: string, command: string, existingCommand: string | null }` objects
   - Inspector must enumerate all events to offer

5. **Session-end event naming per harness**:
   - **Claude Code**: `Stop` (PascalCase, following SessionStart pattern)
   - **Copilot CLI**: Likely `sessionEnd` (camelCase, following sessionStart pattern) — verify via CLI docs
   - **Codex**: Likely `Stop` (PascalCase, following SessionStart pattern) — verify via hook documentation
   - **OpenCode**: No documented session-end hook; may not be supported

## Files to change

- `packages/cli/src/commands/inject.ts` — Add `stop` event branch
- `packages/cli/src/setup/injection-hook-writer.ts` — Add Stop hook for each harness
- `packages/cli/src/commands/inject.test.ts` — Add test cases
- `packages/cli/src/setup/injection-hook-writer.test.ts` — Add test cases

## Implementation steps

### Step 1: Update inject.ts

At lines 102-107, add new branch before legacy no-op:

```typescript
if (opts.event === "session-stop" || opts.event === "stop") {
  await handleEvent(harness, "Stop");
  return;
}
```

### Step 2: Claude Code in injection-hook-writer.ts

Add Stop event inspection and writing following the pattern of SessionStart/UserPromptSubmit.

### Step 3: Copilot CLI in injection-hook-writer.ts

Add sessionEnd event (verify naming), following the flat array pattern.

### Step 4: Codex in injection-hook-writer.ts

Add Stop event, following the nested group pattern.

### Step 5: OpenCode in injection-hook-writer.ts

Document as not-supported (callback-based architecture).

### Step 6: setup-orchestrator.ts

No changes needed — already generic and will auto-discover new Stop events.

## Tests

- inject.ts: verify `--event session-stop` emits Stop
- injection-hook-writer.ts: verify Stop/sessionEnd inspected and written for each harness
- Verify OpenCode remains functional without Stop

## Acceptance criteria

- [ ] `inject.ts` accepts `--event session-stop` and emits "Stop" to harness
- [ ] Claude Code: Stop event in `~/.claude/settings.json`
- [ ] Copilot CLI: `sessionEnd` event in `~/.copilot/settings.json`
- [ ] Codex: Stop event in `~/.codex/hooks.json`
- [ ] OpenCode: Gracefully documented as unsupported
- [ ] setup includes Stop hooks by default
- [ ] All harnesses' Stop/sessionEnd events tested

## Changeset

```
minor @membank/cli — Add Stop hook to capture session-end memories.
```

## Dependencies

None. All harnesses already support hook injection.

## Risk / notes

**OpenCode graceful degradation**: Does not support declarative session-end hooks. Plugin system is callback-based.

**Naming per harness**:
- Claude Code: `Stop` (PascalCase)
- Copilot CLI: `sessionEnd` (camelCase, verify)
- Codex: `Stop` (PascalCase)
- OpenCode: Not supported

**Setup default behavior**: After changes, `membank setup` will prompt users to configure Stop hooks alongside SessionStart/UserPromptSubmit, per issue requirement: "Include Stop in setup by default."
