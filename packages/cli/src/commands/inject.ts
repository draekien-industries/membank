import type { Memory, SessionContext } from "@membank/core";
import { DatabaseManager, resolveProject, SessionContextBuilder } from "@membank/core";
import type { z } from "zod";
import { InjectionHarnessSchema } from "../schemas.js";

const MEMORY_GUIDANCE = [
  "Save (call save_memory) when: (1) user states a preference or makes a decision; (2) user corrects you; (3) you discover a working fix after a tool error; (4) you learn a non-obvious project fact. Type ∈ correction|preference|decision|learning|fact. When unsure, save.",
  "Query (call query_memory) before: answering anything that touches prior decisions, and before exploration tasks (file reads, searches, web lookups) where past corrections or preferences may apply. Skip when clearly irrelevant (e.g. trivial arithmetic). Soft guideline, not a hard rule.",
].join("\n");

type InjectionHarness = z.infer<typeof InjectionHarnessSchema>;

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatContext(ctx: SessionContext): string {
  const parts: string[] = [];

  const statParts = (Object.entries(ctx.stats) as [string, number][])
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${count} ${type}${count !== 1 ? "s" : ""}`);

  if (statParts.length > 0) {
    parts.push(`<memory-stats>\n${statParts.join(", ")}\n</memory-stats>`);
  }

  const allPinned: Memory[] = [...ctx.pinnedGlobal, ...ctx.pinnedProject];
  if (allPinned.length > 0) {
    const memLines = allPinned.map(
      (m) => `  <memory type="${m.type}">${xmlEscape(m.content)}</memory>`
    );
    parts.push(`<pinned-memories>\n${memLines.join("\n")}\n</pinned-memories>`);
  }

  parts.push(`<memory-guidance>\n${MEMORY_GUIDANCE}\n</memory-guidance>`);

  return parts.join("\n");
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

async function buildText(): Promise<string> {
  const resolved = await resolveProject();
  const db = DatabaseManager.open();
  try {
    const builder = new SessionContextBuilder(db);
    const ctx = builder.getSessionContext(resolved.hash);
    return formatContext(ctx);
  } finally {
    db.close();
  }
}

async function handleEvent(
  harness: InjectionHarness | undefined,
  eventName: string
): Promise<void> {
  const text = await buildText().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`membank inject: ${msg}\n`);
    return null;
  });
  if (text === null) {
    process.exit(0);
  }
  outputAdditionalContext(text, harness, eventName);
}

export async function injectCommand(opts: { harness?: string; event?: string }): Promise<void> {
  const harnessResult = InjectionHarnessSchema.safeParse(opts.harness);
  const harness: InjectionHarness | undefined = harnessResult.success
    ? harnessResult.data
    : undefined;
  if (opts.event === "session-start" || opts.event === undefined) {
    await handleEvent(harness, "SessionStart");
    return;
  }
  if (opts.event === "user-prompt-submit") {
    await handleEvent(harness, "UserPromptSubmit");
    return;
  }
  // Legacy --event values from stale hooks: silently no-op.
  process.exit(0);
}

export { formatContext, MEMORY_GUIDANCE };
