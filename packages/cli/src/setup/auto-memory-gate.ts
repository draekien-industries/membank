import { ConfigManager } from "../config/index.js";
import { type AutoMemorySettings, ClaudeSettings } from "./claude-settings.js";
import type { Prompter } from "./setup-orchestrator.js";

export type AutoMemoryOutcome = "none" | "reported" | "disabled";

const DISMISSED_KEY = "setup.autoMemoryPromptDismissed";

export const AUTO_MEMORY_EXPLANATION = [
  "Claude Code's native auto-memory is enabled.",
  "It writes captures to ~/.claude/projects/<project>/memory/ under system-prompt",
  "instructions that outrank membank's MCP tool, so memories land in files membank",
  "never reads — and you pay for both corpora in context.",
];

export interface AutoMemoryGate {
  run(opts: { interactive: boolean; out: (msg: string) => void }): Promise<AutoMemoryOutcome>;
}

// Takes its own Prompter rather than the shared PromptHelper: PromptHelper answers
// `true` unconditionally under --yes, which would silently disable a harness feature.
export class ClaudeAutoMemoryGate implements AutoMemoryGate {
  readonly #settings: AutoMemorySettings;
  readonly #prompter: Prompter;

  constructor(deps: { settings?: AutoMemorySettings; prompter: Prompter }) {
    this.#settings = deps.settings ?? new ClaudeSettings();
    this.#prompter = deps.prompter;
  }

  async run(opts: {
    interactive: boolean;
    out: (msg: string) => void;
  }): Promise<AutoMemoryOutcome> {
    if (this.#settings.autoMemoryStatus() === "disabled") return "none";
    if (ConfigManager.get(DISMISSED_KEY) === true) return "none";

    for (const line of AUTO_MEMORY_EXPLANATION) opts.out(`  ⚠ ${line}`);

    if (!opts.interactive) {
      opts.out(`    Run  membank doctor --fix  to turn it off.`);
      return "reported";
    }

    const disable = await this.#prompter(
      `  Set "autoMemoryEnabled": false in ${this.#settings.path}?`
    );
    if (!disable) {
      ConfigManager.set(DISMISSED_KEY, true);
      opts.out("  ⚠ Left enabled. membank will not ask again.");
      return "reported";
    }

    this.#settings.disableAutoMemory();
    opts.out("  ✓ Native auto-memory disabled.");
    return "disabled";
  }
}
