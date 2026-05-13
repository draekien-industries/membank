import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { MemoryRepository, StatsResult } from "../ports.js";
import { deleteMemory } from "./delete-memory.js";

function makeFakeRepo(): MemoryRepository & { deleteCalls: string[] } {
  const deleteCalls: string[] = [];
  return {
    deleteCalls,
    findById: () => undefined,
    findSimilar: () => [],
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
    create: vi.fn(),
    overwrite: vi.fn(),
    update: vi.fn(),
    delete(id) {
      deleteCalls.push(id);
    },
    createReviewEvent: () => {},
    resolveReviewEvents: () => {},
    setPin: vi.fn(),
    incrementAccessCount: () => {},
  };
}

describe("deleteMemory", () => {
  it("calls repo.delete with the given id", async () => {
    const repo = makeFakeRepo();
    const id = randomUUID();

    await deleteMemory(id, repo);

    expect(repo.deleteCalls).toEqual([id]);
  });
});
