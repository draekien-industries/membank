import { runExtraction } from "@membank/mcp";
import { z } from "zod";

const ExtractionHarnessSchema = z.enum(["claude-code"]);
export type ExtractionHarness = z.infer<typeof ExtractionHarnessSchema>;

// Stdin schema for Claude Code's Stop hook. Other harnesses will need their own schema
// (e.g. copilot-cli, codex) — add cases to parseHookPayload() when those land.
const ClaudeCodeStopInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string().optional(),
  hook_event_name: z.string().optional(),
  stop_hook_active: z.boolean().optional(),
});

interface ParsedHookPayload {
  sessionId: string;
  transcriptPath: string;
  stopHookActive: boolean;
}

function parseHookPayload(
  harness: ExtractionHarness,
  raw: string
): { ok: true; value: ParsedHookPayload } | { ok: false; reason: string } {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "stdin is not valid JSON" };
  }

  if (harness === "claude-code") {
    const parsed = ClaudeCodeStopInputSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return { ok: false, reason: `invalid hook payload: ${parsed.error.message}` };
    }
    return {
      ok: true,
      value: {
        sessionId: parsed.data.session_id,
        transcriptPath: parsed.data.transcript_path,
        stopHookActive: parsed.data.stop_hook_active === true,
      },
    };
  }

  return { ok: false, reason: `unsupported harness: ${harness as string}` };
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function extractCommand(opts: {
  harness?: string;
  sessionId?: string;
  transcript?: string;
}): Promise<void> {
  const harnessResult = ExtractionHarnessSchema.safeParse(opts.harness ?? "claude-code");
  if (!harnessResult.success) {
    process.stderr.write(
      `membank extract: unsupported harness "${opts.harness}". Supported: ${ExtractionHarnessSchema.options.join(", ")}\n`
    );
    return;
  }
  const harness = harnessResult.data;

  let sessionId = opts.sessionId;
  let transcriptPath = opts.transcript;
  let stopHookActive = false;

  if (sessionId === undefined || transcriptPath === undefined) {
    const raw = await readStdin();
    if (raw.trim().length > 0) {
      const parsed = parseHookPayload(harness, raw);
      if (!parsed.ok) {
        process.stderr.write(`membank extract: ${parsed.reason}; skipping.\n`);
        return;
      }
      sessionId = sessionId ?? parsed.value.sessionId;
      transcriptPath = transcriptPath ?? parsed.value.transcriptPath;
      stopHookActive = parsed.value.stopHookActive;
    }
  }

  if (sessionId === undefined || transcriptPath === undefined) {
    process.stderr.write(
      "membank extract: missing session_id or transcript_path (provide via stdin or --session/--transcript).\n"
    );
    return;
  }

  if (stopHookActive) {
    process.stderr.write("membank extract: stop_hook_active=true; skipping to avoid recursion.\n");
    return;
  }

  try {
    const result = await runExtraction({ sessionId, transcriptPath });
    if (result.status === "skipped") {
      process.stderr.write(`membank extract: skipped (${result.reason})\n`);
    } else if (result.status === "failed") {
      process.stderr.write(`membank extract: failed: ${result.error}\n`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`membank extract: ${msg}\n`);
  }
}
