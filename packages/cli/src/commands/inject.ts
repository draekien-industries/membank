import type { Memory, SessionContext } from "@membank/core";
import { DatabaseManager, resolveProject, SessionContextBuilder } from "@membank/core";

const SUPPORTED_INJECTION_HARNESSES = ["claude-code", "copilot-cli", "codex", "opencode"] as const;

const MEMORY_GUIDANCE =
  "[Memory Guidance]: Call save_memory when ANY of these happen: (1) user states a preference or makes a decision; (2) user corrects you; (3) you discover a working fix after a tool error; (4) you learn a non-obvious project fact. Type ∈ correction|preference|decision|learning|fact. Call query_memory before answering anything that might touch prior decisions. When unsure, save.";

type InjectionHarness = (typeof SUPPORTED_INJECTION_HARNESSES)[number];

function formatContext(ctx: SessionContext): string {
  const lines: string[] = [];

  const statParts = (Object.entries(ctx.stats) as [string, number][])
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${count} ${type}${count !== 1 ? "s" : ""}`);

  if (statParts.length > 0) {
    lines.push(`[Memory Stats]: ${statParts.join(", ")}`);
  } else {
    lines.push("[Memory Stats]: no memories saved yet");
  }

  const formatMemory = (m: Memory) => `"${m.content}" (${m.type})`;

  for (const m of ctx.pinnedGlobal) {
    lines.push(`[Pinned Global]: ${formatMemory(m)}`);
  }

  for (const m of ctx.pinnedProject) {
    lines.push(`[Pinned Project]: ${formatMemory(m)}`);
  }

  lines.push(MEMORY_GUIDANCE);

  return lines.join("\n");
}

function outputAdditionalContext(
  text: string,
  harness: InjectionHarness | undefined,
  eventName: string
): void {
  if (harness === "claude-code") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: eventName,
          additionalContext: text,
        },
      })
    );
    return;
  }

  if (harness === "copilot-cli") {
    process.stdout.write(JSON.stringify({ additionalContext: text }));
    return;
  }

  process.stdout.write(`${text}\n`);
}

async function handleSessionStart(opts: { harness?: string }): Promise<void> {
  const resolved = await resolveProject();
  const projectScope = resolved.hash;

  const db = DatabaseManager.open();
  let text: string;
  try {
    const builder = new SessionContextBuilder(db);
    const ctx = builder.getSessionContext(projectScope);
    text = formatContext(ctx);
  } finally {
    db.close();
  }

  if (!text) {
    process.exit(0);
  }

  const harness = opts.harness as InjectionHarness | undefined;
  outputAdditionalContext(text, harness, "SessionStart");
}

export async function injectCommand(opts: { harness?: string; event?: string }): Promise<void> {
  // Legacy --event values from stale hooks installed before user-prompt/tool-failure
  // were removed: silently no-op so old hook configs don't crash.
  if (opts.event !== undefined && opts.event !== "session-start") {
    process.exit(0);
  }

  await handleSessionStart(opts);
}

export { formatContext, MEMORY_GUIDANCE };
