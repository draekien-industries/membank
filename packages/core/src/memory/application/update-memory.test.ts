import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Memory } from "../domain/memory.js";
import type { Embedder, MemoryRepository, StatsResult } from "../ports.js";
import { updateMemory } from "./update-memory.js";

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    content: "original",
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

function makeFakeRepo(updateResult: Memory): MemoryRepository & { updateCalls: unknown[] } {
  const updateCalls: unknown[] = [];
  return {
    updateCalls,
    findById: () => undefined,
    findSimilar: () => [],
    list: () => [],
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
    create: () => updateResult,
    overwrite: () => updateResult,
    update(id, patch, embedding) {
      updateCalls.push({ id, patch, embedding });
      return updateResult;
    },
    delete: () => {},
    createReviewEvent: () => {},
    resolveReviewEvents: () => {},
    setPin: () => updateResult,
    incrementAccessCount: () => {},
  };
}

describe("updateMemory", () => {
  it("calls repo.update with the parsed patch", async () => {
    const id = randomUUID();
    const updated = makeMemory({ id, content: "new content" });
    const repo = makeFakeRepo(updated);
    const embedder: Embedder = { embed: vi.fn().mockResolvedValue(new Float32Array(384)) };

    const result = await updateMemory(id, { content: "new content" }, { repo, embedder });

    expect(result).toBe(updated);
    expect(repo.updateCalls).toHaveLength(1);
    const call = repo.updateCalls[0] as { id: string; patch: unknown; embedding: Float32Array };
    expect(call.id).toBe(id);
  });

  it("calls embedder when content is in the patch", async () => {
    const id = randomUUID();
    const repo = makeFakeRepo(makeMemory());
    const embedder: Embedder = { embed: vi.fn().mockResolvedValue(new Float32Array(384)) };

    await updateMemory(id, { content: "changed" }, { repo, embedder });

    expect(embedder.embed).toHaveBeenCalledWith("changed");
    const call = repo.updateCalls[0] as { embedding: Float32Array };
    expect(call.embedding).toBeInstanceOf(Float32Array);
  });

  it("does NOT call embedder when content is absent from the patch", async () => {
    const id = randomUUID();
    const repo = makeFakeRepo(makeMemory());
    const embedder: Embedder = { embed: vi.fn() };

    await updateMemory(id, { type: "learning" }, { repo, embedder });

    expect(embedder.embed).not.toHaveBeenCalled();
    const call = repo.updateCalls[0] as { embedding: undefined };
    expect(call.embedding).toBeUndefined();
  });
});
