import type { Memory, SessionContext } from "@membank/core";
import { DatabaseManager, resolveScope, SessionContextBuilder } from "@membank/core";

const SUPPORTED_INJECTION_HARNESSES = ["claude-code", "copilot-cli", "codex", "opencode"] as const;

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

  return lines.join("\n");
}

export async function injectCommand(opts: { harness?: string; scope?: string }): Promise<void> {
  const projectScope = opts.scope ?? (await resolveScope());

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

  if (harness === "claude-code") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
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
