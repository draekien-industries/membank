import type { Memory, SessionContext } from "@membank/core";
import { DatabaseManager, resolveScope, SessionContextBuilder } from "@membank/core";

const SUPPORTED_INJECTION_HARNESSES = ["claude-code", "copilot-cli", "codex", "opencode"] as const;

const MEMORY_GUIDANCE =
  "[Memory Guidance]: query_memory before answering on topics where past preferences, corrections, or decisions may apply; save_memory when user corrects you, states a preference, makes a decision, or shares something worth retaining across sessions; update_memory to refine an existing memory (query first to find it) or to set pinned=true/false; delete_memory when a memory is wrong or no longer relevant; pin high-value memories that should always appear at session start";

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

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => resolve(""), 1000);
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => {
      clearTimeout(timeout);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    process.stdin.on("error", () => {
      clearTimeout(timeout);
      resolve("");
    });
  });
}

// Patterns that suggest the user is giving feedback, corrections, or preferences
const FEEDBACK_PATTERNS = [
  /\bdon'?t\b/i,
  /\bstop\b/i,
  /\bnever\b/i,
  /\balways\b/i,
  /\bremember\b/i,
  /\bprefer\b/i,
  /\bi (like|want|hate|dislike)\b/i,
  /\bfrom now on\b/i,
  /\bkeep in mind\b/i,
  /\bnote that\b/i,
  /\bstop doing\b/i,
  /\bstop using\b/i,
  /\bthat'?s wrong\b/i,
  /\bno,?\s+(actually|that'?s)\b/i,
  /\bplease (don'?t|stop|always|never)\b/i,
];

export function looksLikeFeedback(prompt: string): boolean {
  return FEEDBACK_PATTERNS.some((p) => p.test(prompt));
}

export function isToolFailure(data: Record<string, unknown>): boolean {
  // Claude Code PostToolUseFailure, copilot-cli snake_case
  if (data.hook_event_name === "PostToolUseFailure") return true;
  // Claude Code sends "error"; opencode plugin crafts "error_message"
  if (typeof data.error === "string" && data.error.length > 0) return true;
  if (typeof data.error_message === "string" && data.error_message.length > 0) return true;
  const response = data.tool_result ?? data.tool_response;
  if (typeof response === "object" && response !== null) {
    const r = response as Record<string, unknown>;
    if (r.is_error === true) return true;
    // Codex PostToolUse: non-zero exit_code indicates bash failure
    if (typeof r.exit_code === "number" && r.exit_code !== 0) return true;
  }
  // copilot-cli camelCase postToolUse: toolResult.resultType
  const toolResult = data.toolResult;
  if (typeof toolResult === "object" && toolResult !== null) {
    if ((toolResult as Record<string, unknown>).resultType === "failure") return true;
  }
  return false;
}

async function handleSessionStart(opts: { harness?: string; scope?: string }): Promise<void> {
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
  outputAdditionalContext(text, harness, "SessionStart");
}

async function handleUserPrompt(harness: InjectionHarness | undefined): Promise<void> {
  const raw = await readStdin();
  if (!raw) process.exit(0);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    process.exit(0);
  }

  const prompt = typeof data.prompt === "string" ? data.prompt : "";
  if (!looksLikeFeedback(prompt)) process.exit(0);

  const text =
    "User prompt may contain a correction, preference, or decision worth saving. After responding, evaluate: should this be saved as a memory? If yes, call save_memory with the appropriate type (correction/preference/decision/learning) and scope (global or project).";

  outputAdditionalContext(text, harness, "UserPromptSubmit");
}

async function handleToolFailure(harness: InjectionHarness | undefined): Promise<void> {
  const raw = await readStdin();
  if (!raw) process.exit(0);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    process.exit(0);
  }

  if (!isToolFailure(data)) process.exit(0);

  const toolName = typeof data.tool_name === "string" ? data.tool_name : "unknown";
  const text = `Tool "${toolName}" failed. If this reveals a non-obvious constraint, environment issue, or repeatable failure pattern, call save_memory with type "learning" to prevent repeating it.`;

  outputAdditionalContext(text, harness, "PostToolUseFailure");
}

export async function injectCommand(opts: {
  harness?: string;
  scope?: string;
  event?: string;
}): Promise<void> {
  const harness = opts.harness as InjectionHarness | undefined;
  const event = opts.event ?? "session-start";

  if (event === "user-prompt") {
    await handleUserPrompt(harness);
    return;
  }

  if (event === "tool-failure") {
    await handleToolFailure(harness);
    return;
  }

  await handleSessionStart(opts);
}
