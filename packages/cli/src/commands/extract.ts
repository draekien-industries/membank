import { runExtraction } from "@membank/mcp";
import { z } from "zod";

const StopHookInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string().optional(),
  hook_event_name: z.string().optional(),
  stop_hook_active: z.boolean().optional(),
});

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function extractCommand(opts: {
  sessionId?: string;
  transcript?: string;
}): Promise<void> {
  let sessionId = opts.sessionId;
  let transcriptPath = opts.transcript;
  let stopHookActive = false;

  if (sessionId === undefined || transcriptPath === undefined) {
    const raw = await readStdin();
    if (raw.trim().length > 0) {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        process.stderr.write("membank extract: stdin is not valid JSON; skipping.\n");
        return;
      }
      const parsed = StopHookInputSchema.safeParse(parsedJson);
      if (!parsed.success) {
        process.stderr.write(`membank extract: invalid hook payload: ${parsed.error.message}\n`);
        return;
      }
      sessionId = sessionId ?? parsed.data.session_id;
      transcriptPath = transcriptPath ?? parsed.data.transcript_path;
      stopHookActive = parsed.data.stop_hook_active === true;
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
