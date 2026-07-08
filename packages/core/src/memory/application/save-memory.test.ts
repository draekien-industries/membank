import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CapabilityKey } from "../../capability/domain/capability-key.js";
import type { CapabilityRepository } from "../../capability/ports.js";
import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
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
    primaryScopeHash: GLOBAL_SCOPE_HASH,
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
    findManyById: () => [],
    update: () => makeMemory(),
    delete: () => {},
    list: () => [],
    listPinnedGlobal: () => [],
    listPinnedForProject: () => [],
    listFlagged: () => [],
    listReviewEdges: () => [],
    listReviewEvents: () => [],
    getPinnedCharCount: () => 0,
    stats: (): StatsResult => ({
      byType: { correction: 0, preference: 0, decision: 0, learning: 0, fact: 0 },
      total: 0,
      pinned: 0,
      needsReview: 0,
      pinBudgetChars: 0,
    }),
    reviewQueueStats: () => ({ pairs: 0, byBand: { high: 0, mid: 0, low: 0 }, byType: {} }),
    resolveReviewEvents: () => {},
    setPin: () => makeMemory(),
    incrementAccessCount: () => {},
    incrementAccessCountBy: () => {},
    atomicMerge: vi.fn(),
    exportAll: () => [],
    importAll: () => {},
    listVersions: () => [],
    getVersion: () => undefined,
  };
}

function makeEmbedder(vec: Float32Array): Embedder {
  return { embed: vi.fn().mockResolvedValue(vec) };
}

function makeFakeCapabilities(
  associateCalls: Array<{ memoryId: string; capabilityId: string }>
): CapabilityRepository {
  return {
    upsertByKey: (key) => ({
      id: `cap-${key.toString()}`,
      kind: key.kind,
      key: key.toString(),
      createdAt: "",
      updatedAt: "",
    }),
    findByKey: () => null,
    listByKind: () => [],
    associate: (memoryId, capabilityId) => {
      associateCalls.push({ memoryId, capabilityId });
    },
    allMemoriesForCapability: () => [],
  };
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
      { content: "Use tabs", type: "preference", target: { tag: "global" } },
      { repo, embedder }
    );

    expect(repo.createCalls).toHaveLength(1);
    expect(repo.createCalls[0]?.content).toBe("Use tabs");
    expect(repo.createCalls[0]?.type).toBe("preference");
    expect(repo.overwriteCalls).toHaveLength(0);
    expect(repo.reviewEventCalls).toHaveLength(0);
    expect(result.content).toBe("Use tabs");
  });

  it("flags instead of overwriting when similarity > 0.92 but types differ", async () => {
    const existingId = randomUUID();
    const repo = makeFakeRepo([{ id: existingId, type: "preference", similarity: 0.95 }]);
    const embedder = makeEmbedder(embedding);

    await saveMemory(
      { content: "Decided to use tabs", type: "decision", target: { tag: "global" } },
      { repo, embedder }
    );

    expect(repo.overwriteCalls).toHaveLength(0);
    expect(repo.createCalls).toHaveLength(1);
    expect(repo.reviewEventCalls).toHaveLength(1);
    expect(repo.reviewEventCalls[0]?.memoryId).toBe(existingId);
  });

  it("overwrites existing memory when similarity > 0.92", async () => {
    const existingId = randomUUID();
    const repo = makeFakeRepo([{ id: existingId, type: "preference", similarity: 0.95 }]);
    const embedder = makeEmbedder(embedding);

    await saveMemory(
      { content: "Updated content", type: "preference", target: { tag: "global" } },
      { repo, embedder }
    );

    expect(repo.overwriteCalls).toHaveLength(1);
    expect(repo.overwriteCalls[0]?.id).toBe(existingId);
    expect(repo.overwriteCalls[0]?.content).toBe("Updated content");
    expect(repo.createCalls).toHaveLength(0);
    expect(repo.reviewEventCalls).toHaveLength(0);
  });

  it("creates new memory AND flags existing when 0.75 <= similarity <= 0.92", async () => {
    const existingId = randomUUID();
    const repo = makeFakeRepo([{ id: existingId, type: "learning", similarity: 0.85 }]);
    const embedder = makeEmbedder(embedding);

    const result = await saveMemory(
      { content: "Similar content", type: "learning", target: { tag: "global" } },
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
    const repo = makeFakeRepo([{ id: existingId, type: "fact", similarity: 0.5 }]);
    const embedder = makeEmbedder(embedding);

    await saveMemory(
      { content: "Different content", type: "fact", target: { tag: "global" } },
      { repo, embedder }
    );

    expect(repo.createCalls).toHaveLength(1);
    expect(repo.overwriteCalls).toHaveLength(0);
    expect(repo.reviewEventCalls).toHaveLength(0);
  });

  it("passes project scope and tags to create", async () => {
    const repo = makeFakeRepo([]);
    const embedder = makeEmbedder(embedding);

    await saveMemory(
      {
        content: "Tagged memory",
        type: "decision",
        tags: ["a", "b"],
        target: { tag: "project", scope: { hash: "abcdef0123456789", name: "proj" } },
        sourceHarness: "claude",
      },
      { repo, embedder }
    );

    const created = repo.createCalls[0];
    expect(created?.tags).toEqual(["a", "b"]);
    expect(created?.projectScope?.hash).toBe("abcdef0123456789");
    expect(created?.sourceHarness).toBe("claude");
  });

  it("creates a capability memory without a project association and associates it", async () => {
    const repo = makeFakeRepo([{ id: randomUUID(), type: "learning", similarity: 0.99 }]);
    const embedder = makeEmbedder(embedding);
    const associateCalls: Array<{ memoryId: string; capabilityId: string }> = [];
    const capabilities = makeFakeCapabilities(associateCalls);

    const result = await saveMemory(
      {
        content: "Bash needs -e",
        type: "learning",
        target: { tag: "capability", key: CapabilityKey.forTool("Bash") },
      },
      { repo, embedder, capabilities }
    );

    expect(repo.createCalls).toHaveLength(1);
    expect(repo.createCalls[0]?.projectScope).toBeUndefined();
    expect(repo.overwriteCalls).toHaveLength(0);
    expect(repo.reviewEventCalls).toHaveLength(0);
    expect(associateCalls).toEqual([{ memoryId: result.id, capabilityId: "cap-tool:Bash" }]);
  });

  it("throws when a capability target is saved without a CapabilityRepository", async () => {
    const repo = makeFakeRepo([]);
    const embedder = makeEmbedder(embedding);

    await expect(
      saveMemory(
        {
          content: "x",
          type: "fact",
          target: { tag: "capability", key: CapabilityKey.forSkill("simplify") },
        },
        { repo, embedder }
      )
    ).rejects.toThrow(/CapabilityRepository/);
  });

  it("uses the 'fact' type boundary: similarity exactly at 0.92 → flag", async () => {
    const existingId = randomUUID();
    const repo = makeFakeRepo([{ id: existingId, type: "fact", similarity: 0.92 }]);
    const embedder = makeEmbedder(embedding);

    await saveMemory(
      { content: "Boundary", type: "fact", target: { tag: "global" } },
      { repo, embedder }
    );

    expect(repo.reviewEventCalls).toHaveLength(1);
    expect(repo.overwriteCalls).toHaveLength(0);
  });

  it("calls embedder.embed with the content", async () => {
    const repo = makeFakeRepo([]);
    const embedder = makeEmbedder(embedding);

    await saveMemory(
      { content: "Some content", type: "fact", target: { tag: "global" } },
      { repo, embedder }
    );

    expect(embedder.embed).toHaveBeenCalledWith("Some content");
  });
});

describe("saveMemory — type validation", () => {
  it("rejects invalid type", async () => {
    const repo = makeFakeRepo([]);
    const embedder = makeEmbedder(new Float32Array(1));

    await expect(
      saveMemory(
        { content: "x", type: "invalid" as MemoryType, target: { tag: "global" } },
        { repo, embedder }
      )
    ).rejects.toThrow();
  });
});
