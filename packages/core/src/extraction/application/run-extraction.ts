import { MAX_EXTRACTION_CHUNKS } from "../domain/transcript-chunking.js";
import type {
  ExtractionAgentRunner,
  ExtractionConfig,
  ExtractionRunRepository,
  TranscriptReader,
} from "../ports.js";

export interface RunExtractionInput {
  sessionId: string;
  transcriptPath: string;
  projectHash: string;
}

export type RunExtractionResult =
  | { status: "completed" }
  | { status: "skipped"; reason: "in_flight" | "recently_completed" }
  | { status: "failed"; error: string };

export async function runExtraction(
  input: RunExtractionInput,
  deps: {
    repo: ExtractionRunRepository;
    transcripts: TranscriptReader;
    agent: ExtractionAgentRunner;
    config: ExtractionConfig;
    now?: () => Date;
  }
): Promise<RunExtractionResult> {
  const now = deps.now ?? (() => new Date());

  const claimed = deps.repo.tryClaim(input.sessionId, now(), deps.config);
  if (!claimed) {
    const existing = deps.repo.get(input.sessionId);
    const reason =
      existing?.status === "completed" && existing.completedAt !== null
        ? "recently_completed"
        : "in_flight";
    return { status: "skipped", reason };
  }

  try {
    const chunks = await deps.transcripts.read(input.transcriptPath);
    const bounded =
      chunks.length > MAX_EXTRACTION_CHUNKS ? chunks.slice(-MAX_EXTRACTION_CHUNKS) : chunks;
    if (bounded.length < chunks.length) {
      process.stderr.write(
        `membank extraction: transcript exceeded cap, processing most recent ` +
          `${MAX_EXTRACTION_CHUNKS}/${chunks.length} chunks\n`
      );
    }
    // Sequential, not parallel: concurrent runs would race on save_memory's
    // cosine-similarity dedup and could persist near-duplicate memories.
    for (const transcript of bounded) {
      await deps.agent.run({
        transcript,
        projectHash: input.projectHash,
        sessionId: input.sessionId,
      });
    }
    deps.repo.markCompleted(input.sessionId, now());
    return { status: "completed" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.repo.markFailed(input.sessionId, now(), msg);
    return { status: "failed", error: msg };
  }
}
