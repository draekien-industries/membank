import { describe, expect, it, vi } from "vitest";
import type { MemoryRepository, StatsResult } from "../../memory/index.js";
import { GLOBAL_PROJECT_ID } from "../domain/global-scope.js";
import type { ProjectRepository } from "../ports.js";
import { deleteProject } from "./delete-project.js";

function makeFakeMemoryRepo(): MemoryRepository & { deleteCalls: string[] } {
  const deleteCalls: string[] = [];
  return {
    deleteCalls,
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
    delete(id) {
      deleteCalls.push(id);
    },
    createReviewEvent: () => {},
    resolveReviewEvents: () => {},
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

function makeFakeProjectRepo(exclusiveIds: string[]): ProjectRepository & { deletedIds: string[] } {
  const deletedIds: string[] = [];
  return {
    deletedIds,
    upsertByHash: vi.fn(),
    rename: vi.fn(),
    list: () => [],
    getById: vi.fn(),
    getByHash: vi.fn(),
    getByName: vi.fn(),
    addAssociation: vi.fn(),
    removeAssociation: vi.fn(),
    countMemories: vi.fn(() => 0),
    getProjectsForMemories: vi.fn(() => new Map()),
    merge: vi.fn(() => ({ movedMemories: 0 })),
    listExclusiveMemoryIds: () => exclusiveIds,
    deleteById(id) {
      deletedIds.push(id);
    },
  };
}

describe("deleteProject", () => {
  it("deletes the memories exclusive to the project, then the project", () => {
    const memories = makeFakeMemoryRepo();
    const projects = makeFakeProjectRepo(["mem-a", "mem-b"]);

    const result = deleteProject("proj-1", projects, memories);

    expect(memories.deleteCalls).toEqual(["mem-a", "mem-b"]);
    expect(projects.deletedIds).toEqual(["proj-1"]);
    expect(result).toEqual({ deletedMemories: 2 });
  });

  it("keeps shared memories: only exclusive ids are deleted", () => {
    const memories = makeFakeMemoryRepo();
    const projects = makeFakeProjectRepo([]);

    const result = deleteProject("proj-1", projects, memories);

    expect(memories.deleteCalls).toEqual([]);
    expect(projects.deletedIds).toEqual(["proj-1"]);
    expect(result).toEqual({ deletedMemories: 0 });
  });

  it("refuses to delete the global project", () => {
    const memories = makeFakeMemoryRepo();
    const projects = makeFakeProjectRepo(["mem-a"]);

    expect(() => deleteProject(GLOBAL_PROJECT_ID, projects, memories)).toThrow(
      "Cannot delete the global project"
    );
    expect(memories.deleteCalls).toEqual([]);
    expect(projects.deletedIds).toEqual([]);
  });
});
