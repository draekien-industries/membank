import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../../db/manager.js";
import { GLOBAL_PROJECT_ID, GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import { SqliteProjectRepository } from "../../project/infrastructure/sqlite-project-repository.js";
import { seedMemory, seedProject, seedReviewEvent } from "../../test-support/index.js";
import type { MemoryRepository } from "../ports.js";
import { SqliteMemoryRepository } from "./sqlite-memory-repository.js";

const SCOPE = "1111111111111111";
const OTHER_SCOPE = "2222222222222222";

function makeRepo(): { db: DatabaseManager; repo: MemoryRepository } {
  const db = DatabaseManager.openInMemory();
  const projects = new SqliteProjectRepository(db);
  return { db, repo: new SqliteMemoryRepository(db, projects) };
}

describe("SqliteMemoryRepository — pinned listings", () => {
  let db: DatabaseManager;
  let repo: MemoryRepository;
  let projectId: string;

  beforeEach(() => {
    ({ db, repo } = makeRepo());
    projectId = seedProject(db, { scopeHash: SCOPE, name: "alpha" });
  });

  function ids(memories: Array<{ id: string }>): string[] {
    return memories.map((m) => m.id).sort();
  }

  it("lists nothing when no memory is pinned", () => {
    seedMemory(db, { id: "m1", projectId: GLOBAL_PROJECT_ID });

    expect(repo.listPinnedGlobal()).toEqual([]);
  });

  it("lists a pinned memory in the global scope", () => {
    seedMemory(db, { id: "m1", pinned: true, projectId: GLOBAL_PROJECT_ID });

    expect(ids(repo.listPinnedGlobal())).toEqual(["m1"]);
  });

  it("excludes unpinned memories from the global listing", () => {
    seedMemory(db, { id: "pinned", pinned: true, projectId: GLOBAL_PROJECT_ID });
    seedMemory(db, { id: "unpinned", projectId: GLOBAL_PROJECT_ID });

    expect(ids(repo.listPinnedGlobal())).toEqual(["pinned"]);
  });

  it("excludes project-scoped memories from the global listing", () => {
    seedMemory(db, { id: "project", pinned: true, projectId });

    expect(repo.listPinnedGlobal()).toEqual([]);
  });

  it("lists a project's own pinned memories", () => {
    seedMemory(db, { id: "m1", pinned: true, projectId });

    expect(ids(repo.listPinnedForProject(SCOPE))).toEqual(["m1"]);
  });

  it("excludes global memories from a project's listing, which the caller unions itself", () => {
    seedMemory(db, { id: "global", pinned: true, projectId: GLOBAL_PROJECT_ID });
    seedMemory(db, { id: "project", pinned: true, projectId });

    expect(ids(repo.listPinnedForProject(SCOPE))).toEqual(["project"]);
  });

  it("excludes another project's pinned memories", () => {
    const other = seedProject(db, { scopeHash: OTHER_SCOPE, name: "beta" });
    seedMemory(db, { id: "mine", pinned: true, projectId });
    seedMemory(db, { id: "theirs", pinned: true, projectId: other });

    expect(ids(repo.listPinnedForProject(SCOPE))).toEqual(["mine"]);
  });

  it("returns each memory in full, not just its id", () => {
    seedMemory(db, {
      id: "m1",
      content: "always run pnpm build",
      type: "preference",
      tags: ["build"],
      pinned: true,
      projectId,
    });

    expect(repo.listPinnedForProject(SCOPE)[0]).toMatchObject({
      id: "m1",
      content: "always run pnpm build",
      type: "preference",
      tags: ["build"],
      pinned: true,
    });
  });
});

describe("SqliteMemoryRepository — listReviewEdges", () => {
  let db: DatabaseManager;
  let repo: MemoryRepository;
  let projectId: string;

  beforeEach(() => {
    ({ db, repo } = makeRepo());
    projectId = seedProject(db, { scopeHash: SCOPE, name: "alpha" });
  });

  it("returns nothing when no memory has been flagged", () => {
    expect(repo.listReviewEdges()).toEqual([]);
  });

  it("reports a flagged pair as an edge between the two memories", () => {
    seedMemory(db, { id: "m1" });
    seedMemory(db, { id: "m2" });
    seedReviewEvent(db, { memoryId: "m1", conflictingMemoryId: "m2" });

    expect(repo.listReviewEdges()).toEqual([{ memoryId: "m1", conflictingMemoryId: "m2" }]);
  });

  it("omits resolved events, which no longer need review", () => {
    seedMemory(db, { id: "m1" });
    seedMemory(db, { id: "m2" });
    seedReviewEvent(db, {
      memoryId: "m1",
      conflictingMemoryId: "m2",
      resolvedAt: new Date().toISOString(),
    });

    expect(repo.listReviewEdges()).toEqual([]);
  });

  it("omits events with no counterpart, since those form no edge", () => {
    seedMemory(db, { id: "m1" });
    seedReviewEvent(db, { memoryId: "m1", conflictingMemoryId: null });

    expect(repo.listReviewEdges()).toEqual([]);
  });

  it("narrows to the project's own memories when a scope is given", () => {
    const other = seedProject(db, { scopeHash: OTHER_SCOPE, name: "beta" });
    seedMemory(db, { id: "mine", projectId });
    seedMemory(db, { id: "mine-conflict", projectId });
    seedMemory(db, { id: "theirs", projectId: other });
    seedMemory(db, { id: "theirs-conflict", projectId: other });
    seedReviewEvent(db, { memoryId: "mine", conflictingMemoryId: "mine-conflict" });
    seedReviewEvent(db, { memoryId: "theirs", conflictingMemoryId: "theirs-conflict" });

    expect(repo.listReviewEdges(SCOPE).map((e) => e.memoryId)).toEqual(["mine"]);
  });

  it("includes global memories in a project scope, since they apply everywhere", () => {
    seedMemory(db, { id: "global", projectId: GLOBAL_PROJECT_ID });
    seedMemory(db, { id: "global-conflict", projectId: GLOBAL_PROJECT_ID });
    seedReviewEvent(db, { memoryId: "global", conflictingMemoryId: "global-conflict" });

    expect(repo.listReviewEdges(SCOPE).map((e) => e.memoryId)).toEqual(["global"]);
  });
});

describe("SqliteMemoryRepository — reviewQueueStats", () => {
  let db: DatabaseManager;
  let repo: MemoryRepository;
  let projectId: string;

  beforeEach(() => {
    ({ db, repo } = makeRepo());
    projectId = seedProject(db, { scopeHash: SCOPE, name: "alpha" });
  });

  it("reports an empty queue as all zeros with no type breakdown", () => {
    expect(repo.reviewQueueStats()).toEqual({
      pairs: 0,
      byBand: { high: 0, mid: 0, low: 0 },
      byType: {},
    });
  });

  it("counts one unresolved event as one pair", () => {
    seedMemory(db, { id: "m1" });
    seedReviewEvent(db, { memoryId: "m1" });

    expect(repo.reviewQueueStats().pairs).toBe(1);
  });

  it("excludes resolved events from the pair count", () => {
    seedMemory(db, { id: "m1" });
    seedReviewEvent(db, { memoryId: "m1", resolvedAt: new Date().toISOString() });

    expect(repo.reviewQueueStats().pairs).toBe(0);
  });

  it("bands a similarity at or above 0.85 as high", () => {
    seedMemory(db, { id: "m1" });
    seedReviewEvent(db, { memoryId: "m1", similarity: 0.85 });

    expect(repo.reviewQueueStats().byBand).toEqual({ high: 1, mid: 0, low: 0 });
  });

  it("bands a similarity in [0.80, 0.85) as mid", () => {
    seedMemory(db, { id: "m1" });
    seedReviewEvent(db, { memoryId: "m1", similarity: 0.84 });

    expect(repo.reviewQueueStats().byBand).toEqual({ high: 0, mid: 1, low: 0 });
  });

  it("bands a similarity below 0.80 as low", () => {
    seedMemory(db, { id: "m1" });
    seedReviewEvent(db, { memoryId: "m1", similarity: 0.79 });

    expect(repo.reviewQueueStats().byBand).toEqual({ high: 0, mid: 0, low: 1 });
  });

  it("counts a memory once per band however many events it has", () => {
    seedMemory(db, { id: "m1" });
    seedMemory(db, { id: "m2" });
    seedReviewEvent(db, { memoryId: "m1", conflictingMemoryId: "m2", similarity: 0.9 });
    seedReviewEvent(db, { memoryId: "m1", conflictingMemoryId: null, similarity: 0.92 });

    const stats = repo.reviewQueueStats();

    expect(stats.pairs).toBe(2);
    expect(stats.byBand.high).toBe(1);
  });

  it("breaks the queue down by memory type", () => {
    seedMemory(db, { id: "pref", type: "preference" });
    seedMemory(db, { id: "fact", type: "fact" });
    seedReviewEvent(db, { memoryId: "pref" });
    seedReviewEvent(db, { memoryId: "fact" });

    expect(repo.reviewQueueStats().byType).toEqual({ preference: 1, fact: 1 });
  });

  it("narrows to the given project scope", () => {
    const other = seedProject(db, { scopeHash: OTHER_SCOPE, name: "beta" });
    seedMemory(db, { id: "mine", projectId });
    seedMemory(db, { id: "theirs", projectId: other });
    seedReviewEvent(db, { memoryId: "mine" });
    seedReviewEvent(db, { memoryId: "theirs" });

    expect(repo.reviewQueueStats(SCOPE).pairs).toBe(1);
  });

  it("counts global memories inside a project scope", () => {
    seedMemory(db, { id: "global", projectId: GLOBAL_PROJECT_ID });
    seedReviewEvent(db, { memoryId: "global" });

    expect(repo.reviewQueueStats(GLOBAL_SCOPE_HASH).pairs).toBe(1);
    expect(repo.reviewQueueStats(SCOPE).pairs).toBe(1);
  });
});
