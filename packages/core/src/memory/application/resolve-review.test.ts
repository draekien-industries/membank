import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { MemoryRepository, StatsResult } from "../ports.js";
import { resolveReview } from "./resolve-review.js";

function makeFakeRepo(): MemoryRepository & { resolveCalls: string[] } {
  const resolveCalls: string[] = [];
  return {
    resolveCalls,
    findById: () => undefined,
    findManyById: () => [],
    findSimilar: () => [],
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
    create: vi.fn(),
    overwrite: vi.fn(),
    update: vi.fn(),
    delete: () => {},
    createReviewEvent: () => {},
    resolveReviewEvents(id) {
      resolveCalls.push(id);
    },
    setPin: vi.fn(),
    incrementAccessCount: () => {},
    incrementAccessCountBy: () => {},
    atomicMerge: vi.fn(),
    exportAll: () => [],
    importAll: () => {},
    listVersions: () => [],
    getVersion: () => undefined,
  };
}

describe("resolveReview", () => {
  it("calls repo.resolveReviewEvents with the given memoryId", () => {
    const repo = makeFakeRepo();
    const id = randomUUID();

    resolveReview(id, repo);

    expect(repo.resolveCalls).toEqual([id]);
  });
});
