import { STOP_HOOK_PROMPT } from "../setup/injection-hook-writer.js";

export function stopHookCommand(opts: { harness?: string }): void {
  const { harness } = opts;

  if (harness === "copilot-cli" || harness === "codex") {
    process.stdout.write(JSON.stringify({ systemMessage: STOP_HOOK_PROMPT }));
    return;
  }

  process.stdout.write(`${STOP_HOOK_PROMPT}\n`);
}
