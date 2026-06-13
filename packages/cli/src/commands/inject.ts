import type { SessionContext } from "@membank/core";
import {
  collectSynthesisSections,
  createMemoryRepository,
  createProjectRepository,
  createSynthesisRepository,
  DatabaseManager,
  DEFAULT_SYNTHESIS_THRESHOLD_WORDS,
  GLOBAL_SCOPE_HASH,
  renderSessionContext,
  resolveProject,
  SessionContextBuilder,
} from "@membank/core";
import type { z } from "zod";
import { ConfigManager } from "../config/manager.js";
import { InjectionHarnessSchema } from "../schemas.js";

type InjectionHarness = z.infer<typeof InjectionHarnessSchema>;

const SAVE_GUIDANCE =
  "Save (call save_memory) when: (1) user states a preference or makes a decision; (2) user corrects you; (3) you discover a working fix after a tool error; (4) you learn a non-obvious project fact. Type ∈ correction|preference|decision|learning|fact. When unsure, save.";

const QUERY_GUIDANCE =
  "Query (call query_memory) before: answering anything that touches prior decisions, and before exploration tasks (file reads, searches, web lookups) where past corrections or preferences may apply. Skip when clearly irrelevant (e.g. trivial arithmetic). Soft guideline, not a hard rule.";

// Full guidance for harnesses without a session-end extractor (copilot-cli, codex).
const MEMORY_GUIDANCE = [SAVE_GUIDANCE, QUERY_GUIDANCE].join("\n");

// claude-code has a SessionEnd extractor that handles saves automatically — only query guidance needed.
function buildGuidance(harness: InjectionHarness | undefined): string {
  return harness === "claude-code" ? QUERY_GUIDANCE : MEMORY_GUIDANCE;
}

function formatContext(ctx: SessionContext, guidance: string): string {
  const parts: string[] = [];

  const statParts = Object.entries(ctx.stats)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${count} ${type}${count !== 1 ? "s" : ""}`);

  if (statParts.length > 0) {
    parts.push(`<memory-stats>\n${statParts.join(", ")}\n</memory-stats>`);
  }

  const rendered = renderSessionContext(ctx);
  if (rendered.length > 0) {
    parts.push(rendered);
  }

  parts.push(`<memory-guidance>\n${guidance}\n</memory-guidance>`);

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

  process.stdout.write(`${text}\n`);
}

function resolveThresholdWords(): number {
  const configured = ConfigManager.get("synthesis.synthesisThresholdWords");
  return typeof configured === "number" ? configured : DEFAULT_SYNTHESIS_THRESHOLD_WORDS;
}

async function buildText(harness: InjectionHarness | undefined): Promise<string> {
  const resolved = await resolveProject();
  const db = DatabaseManager.open();
  try {
    const projects = createProjectRepository(db);
    const repo = createMemoryRepository(db, projects);
    const builder = new SessionContextBuilder(repo);
    const synthRepo = createSynthesisRepository(db);

    const scopes = [...new Set([GLOBAL_SCOPE_HASH, resolved.hash])];
    const sections = collectSynthesisSections(synthRepo, scopes, resolveThresholdWords());
    const ctx = builder.getSessionContext(resolved.hash, sections);
    return formatContext(ctx, buildGuidance(harness));
  } finally {
    db.close();
  }
}

async function handleEvent(
  harness: InjectionHarness | undefined,
  eventName: string
): Promise<void> {
  const text = await buildText(harness).catch((err: unknown) => {
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
    // claude-code uses SessionEnd extraction — per-prompt re-injection is not needed.
    if (harness === "claude-code") {
      process.exit(0);
    }
    await handleEvent(harness, "UserPromptSubmit");
    return;
  }
  // Legacy --event values from stale hooks: silently no-op.
  process.exit(0);
}

export { formatContext, MEMORY_GUIDANCE };
