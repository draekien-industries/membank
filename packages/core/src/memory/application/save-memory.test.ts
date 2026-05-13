import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Memory, MemoryType } from "../domain/memory.js";
import type {
  CreateMemoryOpts,
  CreateReviewEventOpts,
  Embedder,
  MemoryRepository,
  SimilarMemoryResult,
  StatsResult,
} from "../ports.js";
import { saveMemory } from "./save-memory.js";

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    content: "default content",
    type: "fact",
    tags: [],
    projects: [],
    sourceHarness: null,
    accessCount: 0,
    pinned: false,
    reviewEvents: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeFakeRepo(
  similarResults: SimilarMemoryResult[] = [],
  createdMemory?: Memory
): MemoryRepository & {
  createCalls: CreateMemoryOpts[];
  overwriteCalls: Array<{ id: string; content: string }>;
  reviewEventCalls: CreateReviewEventOpts[];
} {
  const createCalls: CreateMemoryOpts[] = [];
  const overwriteCalls: Array<{ id: string; content: string }> = [];
  const reviewEventCalls: CreateReviewEventOpts[] = [];

  return {
    createCalls,
    overwriteCalls,
    reviewEventCalls,
    findSimilar: () => similarResults,
    create(opts) {
      createCalls.push(opts);
      return createdMemory ?? makeMemory({ id: opts.id, content: opts.content, type: opts.type });
    },
    overwrite(id, content) {
      overwriteCalls.push({ id, content });
      return makeMemory({ id, content });
    },
    createReviewEvent(opts) {
      reviewEventCalls.push(opts);
    },
    findById: () => undefined,
    update: () => makeMemory(),
    delete: () => {},
    list: () => [],
    listPinnedGlobal: () => [],
    listPinnedForProject: () => [],
    listFlagged: () => [],
    listReviewEvents: () => [],
    getPinnedCharCount: () => 0,
    stats: (): StatsResult => ({
      byType: { correction: 0, preference: 0, decision: 0, learning: 0, fact: 0 },
      total: 0,
      pinned: 0,
      needsReview: 0,
      pinBudgetChars: 0,
    }),
    resolveReviewEvents: () => {},
    setPin: () => makeMemory(),
    incrementAccessCount: () => {},
  };
}

function makeEmbedder(vec: Float32Array): Embedder {
  return { embed: vi.fn().mockResolvedValue(vec) };
}

describe("saveMemory", () => {
  let embedding: Float32Array;

  beforeEach(() => {
    embedding = new Float32Array(384).fill(0);
    embedding[0] = 1;
  });

  it("creates a new memory when no similar exists", async () => {
    const repo = makeFakeRepo([]);
    const embedder = makeEmbedder(embedding);

    const result = await saveMemory(
      { content: "Use tabs", type: "preference" },
      { repo, embedder }
    );

    expect(repo.createCalls).toHaveLength(1);
    expect(repo.createCalls[0]?.content).toBe("Use tabs");
    expect(repo.createCalls[0]?.type).toBe("preference");
    expect(repo.overwriteCalls).toHaveLength(0);
    expect(repo.reviewEventCalls).toHaveLength(0);
    expect(result.content).toBe("Use tabs");
  });

  it("overwrites existing memory when similarity > 0.92", async () => {
    const existingId = randomUUID();
    const repo = makeFakeRepo([{ id: existingId, similarity: 0.95 }]);
    const embedder = makeEmbedder(embedding);

    await saveMemory({ content: "Updated content", type: "preference" }, { repo, embedder });

    expect(repo.overwriteCalls).toHaveLength(1);
    expect(repo.overwriteCalls[0]?.id).toBe(existingId);
    expect(repo.overwriteCalls[0]?.content).toBe("Updated content");
    expect(repo.createCalls).toHaveLength(0);
    expect(repo.reviewEventCalls).toHaveLength(0);
  });

  it("creates new memory AND flags existing when 0.75 <= similarity <= 0.92", async () => {
    const existingId = randomUUID();
    const repo = makeFakeRepo([{ id: existingId, similarity: 0.85 }]);
    const embedder = makeEmbedder(embedding);

    const result = await saveMemory(
      { content: "Similar content", type: "learning" },
      { repo, embedder }
    );

    expect(repo.createCalls).toHaveLength(1);
    expect(repo.overwriteCalls).toHaveLength(0);
    expect(repo.reviewEventCalls).toHaveLength(1);
    expect(repo.reviewEventCalls[0]?.memoryId).toBe(existingId);
    expect(repo.reviewEventCalls[0]?.conflictingMemoryId).toBe(result.id);
    expect(repo.reviewEventCalls[0]?.similarity).toBe(0.85);
    expect(repo.reviewEventCalls[0]?.conflictContentSnapshot).toBe("Similar content");
  });

  it("creates new memory without review event when similarity < 0.75", async () => {
    const existingId = randomUUID();
    const repo = makeFakeRepo([{ id: existingId, similarity: 0.5 }]);
    const embedder = makeEmbedder(embedding);

    await saveMemory({ content: "Different content", type: "fact" }, { repo, embedder });

    expect(repo.createCalls).toHaveLength(1);
    expect(repo.overwriteCalls).toHaveLength(0);
    expect(repo.reviewEventCalls).toHaveLength(0);
  });

  it("passes projectScope and tags to create", async () => {
    const repo = makeFakeRepo([]);
    const embedder = makeEmbedder(embedding);

    await saveMemory(
      {
        content: "Tagged memory",
        type: "decision",
        tags: ["a", "b"],
        projectScope: { hash: "abcdef0123456789", name: "proj" },
        sourceHarness: "claude",
      },
      { repo, embedder }
    );

    const created = repo.createCalls[0];
    expect(created?.tags).toEqual(["a", "b"]);
    expect(created?.projectScope?.hash).toBe("abcdef0123456789");
    expect(created?.sourceHarness).toBe("claude");
  });

  it("uses the 'fact' type boundary: similarity exactly at 0.92 → flag", async () => {
    const existingId = randomUUID();
    const repo = makeFakeRepo([{ id: existingId, similarity: 0.92 }]);
    const embedder = makeEmbedder(embedding);

    await saveMemory({ content: "Boundary", type: "fact" }, { repo, embedder });

    expect(repo.reviewEventCalls).toHaveLength(1);
    expect(repo.overwriteCalls).toHaveLength(0);
  });

  it("calls embedder.embed with the content", async () => {
    const repo = makeFakeRepo([]);
    const embedder = makeEmbedder(embedding);

    await saveMemory({ content: "Some content", type: "fact" }, { repo, embedder });

    expect(embedder.embed).toHaveBeenCalledWith("Some content");
  });
});

describe("saveMemory — type validation", () => {
  it("rejects invalid type", async () => {
    const repo = makeFakeRepo([]);
    const embedder = makeEmbedder(new Float32Array(1));

    await expect(
      saveMemory({ content: "x", type: "invalid" as MemoryType }, { repo, embedder })
    ).rejects.toThrow();
  });
});
