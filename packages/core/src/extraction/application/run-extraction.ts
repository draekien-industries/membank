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
    const transcript = await deps.transcripts.read(input.transcriptPath);
    await deps.agent.run({
      transcript,
      projectHash: input.projectHash,
      sessionId: input.sessionId,
    });
    deps.repo.markCompleted(input.sessionId, now());
    return { status: "completed" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.repo.markFailed(input.sessionId, now(), msg);
    return { status: "failed", error: msg };
  }
}
