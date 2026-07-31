import {
  DEFAULT_IN_FLIGHT_TIMEOUT_MS,
  TRANSCRIPT_RETRY_DELAY_MS,
} from "../domain/extraction-policy.js";
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
  | {
      status: "skipped";
      reason: "in_flight" | "recently_completed" | "transcript_unavailable";
    }
  | { status: "failed"; error: string };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readWithRetry(
  transcripts: TranscriptReader,
  transcriptPath: string,
  sleep: (ms: number) => Promise<void>
): Promise<string[] | null> {
  const first = await transcripts.read(transcriptPath);
  if (first.status === "read") return first.chunks;

  await sleep(TRANSCRIPT_RETRY_DELAY_MS);

  const second = await transcripts.read(transcriptPath);
  return second.status === "read" ? second.chunks : null;
}

export async function runExtraction(
  input: RunExtractionInput,
  deps: {
    repo: ExtractionRunRepository;
    transcripts: TranscriptReader;
    agent: ExtractionAgentRunner;
    config: ExtractionConfig;
    now?: () => Date;
    sleep?: (ms: number) => Promise<void>;
  }
): Promise<RunExtractionResult> {
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? delay;

  const reaped = deps.repo.reapStale(
    now(),
    deps.config.inFlightTimeoutMs ?? DEFAULT_IN_FLIGHT_TIMEOUT_MS
  );
  if (reaped > 0) {
    process.stderr.write(`membank extraction: reaped ${reaped} stale in-flight run(s)\n`);
  }

  // Read before claiming: an absent transcript must not leave a run row behind at all.
  const chunks = await readWithRetry(deps.transcripts, input.transcriptPath, sleep);
  if (chunks === null) {
    return { status: "skipped", reason: "transcript_unavailable" };
  }

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
