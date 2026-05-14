import { describe, expect, it, vi } from "vitest";
import type {
  ExtractionAgentRunner,
  ExtractionConfig,
  ExtractionRunRecord,
  ExtractionRunRepository,
  TranscriptReader,
} from "../ports.js";
import { runExtraction } from "./run-extraction.js";

function makeFakeRepo(initial?: ExtractionRunRecord): ExtractionRunRepository & {
  state: { record: ExtractionRunRecord | undefined; claims: number };
} {
  const state: { record: ExtractionRunRecord | undefined; claims: number } = {
    record: initial,
    claims: 0,
  };
  return {
    state,
    tryClaim(sessionId, now) {
      state.claims += 1;
      const existing = state.record;
      if (existing !== undefined && existing.status === "in_flight") return false;
      if (existing !== undefined && existing.status === "completed") return false;
      state.record = {
        sessionId,
        startedAt: now.toISOString(),
        completedAt: null,
        status: "in_flight",
        error: null,
      };
      return true;
    },
    markCompleted(sessionId, now) {
      state.record = {
        sessionId,
        startedAt: state.record?.startedAt ?? now.toISOString(),
        completedAt: now.toISOString(),
        status: "completed",
        error: null,
      };
    },
    markFailed(sessionId, now, error) {
      state.record = {
        sessionId,
        startedAt: state.record?.startedAt ?? now.toISOString(),
        completedAt: now.toISOString(),
        status: "failed",
        error,
      };
    },
    get() {
      return state.record;
    },
  };
}

const transcripts: TranscriptReader = {
  read: async () => "user: hi\nassistant: hello",
};

const config: ExtractionConfig = {};

describe("runExtraction", () => {
  it("runs the agent, marks completed on success", async () => {
    const repo = makeFakeRepo();
    const agent: ExtractionAgentRunner = { run: vi.fn().mockResolvedValue(undefined) };

    const result = await runExtraction(
      { sessionId: "s1", transcriptPath: "/t", projectHash: "abc" },
      { repo, transcripts, agent, config }
    );

    expect(result).toEqual({ status: "completed" });
    expect(agent.run).toHaveBeenCalledWith({
      transcript: "user: hi\nassistant: hello",
      projectHash: "abc",
      sessionId: "s1",
    });
    expect(repo.state.record?.status).toBe("completed");
  });

  it("skips when an in-flight run already exists", async () => {
    const repo = makeFakeRepo({
      sessionId: "s1",
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: "in_flight",
      error: null,
    });
    const agent: ExtractionAgentRunner = { run: vi.fn() };

    const result = await runExtraction(
      { sessionId: "s1", transcriptPath: "/t", projectHash: "abc" },
      { repo, transcripts, agent, config }
    );

    expect(result).toEqual({ status: "skipped", reason: "in_flight" });
    expect(agent.run).not.toHaveBeenCalled();
  });

  it("marks failed and returns error message when the agent throws", async () => {
    const repo = makeFakeRepo();
    const agent: ExtractionAgentRunner = {
      run: vi.fn().mockRejectedValue(new Error("boom")),
    };

    const result = await runExtraction(
      { sessionId: "s1", transcriptPath: "/t", projectHash: "abc" },
      { repo, transcripts, agent, config }
    );

    expect(result).toEqual({ status: "failed", error: "boom" });
    expect(repo.state.record?.status).toBe("failed");
    expect(repo.state.record?.error).toBe("boom");
  });
});
