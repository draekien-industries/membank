import { describe, expect, it, vi } from "vitest";
import type {
  ExtractionAgentRunner,
  ExtractionConfig,
  ExtractionRunRecord,
  ExtractionRunRepository,
  RejectedCandidateRepository,
  TranscriptReader,
} from "../ports.js";
import { runExtraction } from "./run-extraction.js";

function makeFakeRepo(initial?: ExtractionRunRecord): ExtractionRunRepository & {
  state: { record: ExtractionRunRecord | undefined; claims: number; reaps: number };
} {
  const state: { record: ExtractionRunRecord | undefined; claims: number; reaps: number } = {
    record: initial,
    claims: 0,
    reaps: 0,
  };
  return {
    state,
    reapStale() {
      state.reaps += 1;
      return 0;
    },
    stats() {
      return { total: 0, failed: 0, staleInFlight: 0 };
    },
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
  read: async () => ({ status: "read", chunks: ["user: hi\nassistant: hello"] }),
};

const config: ExtractionConfig = {};

const rejections: RejectedCandidateRepository & { prunes: number } = {
  prunes: 0,
  record: () => {},
  prune() {
    this.prunes += 1;
    return 0;
  },
  countByClause: () => [],
};

const noSleep = async (): Promise<void> => {};

describe("runExtraction", () => {
  it("runs the agent, marks completed on success", async () => {
    const repo = makeFakeRepo();
    const agent: ExtractionAgentRunner = { run: vi.fn().mockResolvedValue(undefined) };

    const result = await runExtraction(
      { sessionId: "s1", transcriptPath: "/t", projectHash: "abc" },
      { repo, transcripts, agent, rejections, config }
    );

    expect(result).toEqual({ status: "completed" });
    expect(agent.run).toHaveBeenCalledWith({
      transcript: "user: hi\nassistant: hello",
      projectHash: "abc",
      sessionId: "s1",
    });
    expect(repo.state.record?.status).toBe("completed");
  });

  it("runs the agent once per chunk", async () => {
    const repo = makeFakeRepo();
    const agent: ExtractionAgentRunner = { run: vi.fn().mockResolvedValue(undefined) };
    const chunked: TranscriptReader = {
      read: async () => ({ status: "read", chunks: ["chunk-1", "chunk-2", "chunk-3"] }),
    };

    const result = await runExtraction(
      { sessionId: "s1", transcriptPath: "/t", projectHash: "abc" },
      { repo, transcripts: chunked, agent, rejections, config }
    );

    expect(result).toEqual({ status: "completed" });
    expect(agent.run).toHaveBeenCalledTimes(3);
    expect(agent.run).toHaveBeenNthCalledWith(1, {
      transcript: "chunk-1",
      projectHash: "abc",
      sessionId: "s1",
    });
    expect(agent.run).toHaveBeenNthCalledWith(3, {
      transcript: "chunk-3",
      projectHash: "abc",
      sessionId: "s1",
    });
  });

  it("processes only the most recent chunks when the cap is exceeded", async () => {
    const repo = makeFakeRepo();
    const agent: ExtractionAgentRunner = { run: vi.fn().mockResolvedValue(undefined) };
    const chunks = Array.from({ length: 13 }, (_, i) => `chunk-${i}`);
    const chunked: TranscriptReader = { read: async () => ({ status: "read", chunks }) };

    const result = await runExtraction(
      { sessionId: "s1", transcriptPath: "/t", projectHash: "abc" },
      { repo, transcripts: chunked, agent, rejections, config }
    );

    expect(result).toEqual({ status: "completed" });
    expect(agent.run).toHaveBeenCalledTimes(10);
    expect(agent.run).toHaveBeenNthCalledWith(1, {
      transcript: "chunk-3",
      projectHash: "abc",
      sessionId: "s1",
    });
    expect(agent.run).toHaveBeenNthCalledWith(10, {
      transcript: "chunk-12",
      projectHash: "abc",
      sessionId: "s1",
    });
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
      { repo, transcripts, agent, rejections, config }
    );

    expect(result).toEqual({ status: "skipped", reason: "in_flight" });
    expect(agent.run).not.toHaveBeenCalled();
  });

  it("skips without recording a run when the transcript never appears", async () => {
    const repo = makeFakeRepo();
    const agent: ExtractionAgentRunner = { run: vi.fn() };
    const absent: TranscriptReader = { read: async () => ({ status: "unavailable" }) };

    const result = await runExtraction(
      { sessionId: "s1", transcriptPath: "/t", projectHash: "abc" },
      { repo, transcripts: absent, agent, rejections, config, sleep: noSleep }
    );

    expect(result).toEqual({ status: "skipped", reason: "transcript_unavailable" });
    expect(repo.state.claims).toBe(0);
    expect(repo.state.record).toBeUndefined();
    expect(agent.run).not.toHaveBeenCalled();
  });

  it("completes when the transcript appears on the retry", async () => {
    const repo = makeFakeRepo();
    const agent: ExtractionAgentRunner = { run: vi.fn().mockResolvedValue(undefined) };
    const read = vi
      .fn()
      .mockResolvedValueOnce({ status: "unavailable" })
      .mockResolvedValueOnce({ status: "read", chunks: ["chunk-1"] });

    const result = await runExtraction(
      { sessionId: "s1", transcriptPath: "/t", projectHash: "abc" },
      { repo, transcripts: { read }, agent, rejections, config, sleep: noSleep }
    );

    expect(result).toEqual({ status: "completed" });
    expect(read).toHaveBeenCalledTimes(2);
    expect(agent.run).toHaveBeenCalledTimes(1);
  });

  it("reaps stale in-flight runs before claiming", async () => {
    const repo = makeFakeRepo();
    const agent: ExtractionAgentRunner = { run: vi.fn().mockResolvedValue(undefined) };

    await runExtraction(
      { sessionId: "s1", transcriptPath: "/t", projectHash: "abc" },
      { repo, transcripts, agent, rejections, config }
    );

    expect(repo.state.reaps).toBe(1);
  });

  it("marks failed and returns error message when the agent throws", async () => {
    const repo = makeFakeRepo();
    const agent: ExtractionAgentRunner = {
      run: vi.fn().mockRejectedValue(new Error("boom")),
    };

    const result = await runExtraction(
      { sessionId: "s1", transcriptPath: "/t", projectHash: "abc" },
      { repo, transcripts, agent, rejections, config }
    );

    expect(result).toEqual({ status: "failed", error: "boom" });
    expect(repo.state.record?.status).toBe("failed");
    expect(repo.state.record?.error).toBe("boom");
  });
});
