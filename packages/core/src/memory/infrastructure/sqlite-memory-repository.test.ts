import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../../db/manager.js";
import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import { ProjectRepository } from "../../project/repository.js";
import { SqliteMemoryRepository } from "./sqlite-memory-repository.js";

const runIntegration = process.env.MEMBANK_INTEGRATION === "true";
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../../test-fixtures");

function makeEmbedding(dimension: number): Float32Array {
  const arr = new Float32Array(384).fill(0);
  arr[dimension] = 1;
  return arr;
}

describe.skipIf(!runIntegration)("SqliteMemoryRepository — integration (file-based DB)", () => {
  let dbPath: string;
  let db: DatabaseManager;
  let projects: ProjectRepository;
  let repo: SqliteMemoryRepository;

  beforeEach(() => {
    mkdirSync(fixturesDir, { recursive: true });
    dbPath = join(fixturesDir, `${randomUUID()}.db`);
    db = DatabaseManager.open(dbPath);
    projects = new ProjectRepository(db);
    repo = new SqliteMemoryRepository(db, projects);
  });

  afterEach(() => {
    db.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(dbPath + suffix, { force: true });
    }
  });

  it("create() inserts a memory and returns it with correct shape", () => {
    const id = randomUUID();
    const memory = repo.create({
      id,
      content: "integration test memory",
      type: "fact",
      tags: ["test"],
      sourceHarness: "test-harness",
      embedding: makeEmbedding(0),
    });

    expect(memory.id).toBe(id);
    expect(memory.content).toBe("integration test memory");
    expect(memory.type).toBe("fact");
    expect(memory.tags).toEqual(["test"]);
    expect(memory.sourceHarness).toBe("test-harness");
    expect(memory.pinned).toBe(false);
    expect(memory.accessCount).toBe(0);
  });

  it("create() without a projectScope leaves the memory unassociated", () => {
    const memory = repo.create({
      id: randomUUID(),
      content: "unassociated memory",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
    });

    expect(memory.projects).toHaveLength(0);
    expect(memory.primaryScopeHash).toBe(GLOBAL_SCOPE_HASH);
  });

  it("create() with projectScope associates the memory to the project", () => {
    const id = randomUUID();
    const memory = repo.create({
      id,
      content: "project memory",
      type: "preference",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
      projectScope: { hash: "abcdef0123456789", name: "test-project" },
    });

    expect(memory.projects).toHaveLength(1);
    expect(memory.projects[0]?.scopeHash).toBe("abcdef0123456789");
  });

  it("findSimilar() returns the most similar memory with its similarity score", () => {
    repo.create({
      id: randomUUID(),
      content: "vector memory",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
      projectScope: { hash: GLOBAL_SCOPE_HASH, name: "global" },
    });

    const results = repo.findSimilar(makeEmbedding(0), "fact");
    expect(results).toHaveLength(1);
    expect(results[0]?.similarity).toBeGreaterThan(0.99);
  });

  it("findSimilar() returns empty array when no memories exist", () => {
    const results = repo.findSimilar(makeEmbedding(0), "fact");
    expect(results).toEqual([]);
  });

  it("overwrite() updates content and returns updated memory", () => {
    const id = randomUUID();
    repo.create({
      id,
      content: "original",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
    });

    const updated = repo.overwrite(id, "overwritten", makeEmbedding(1));
    expect(updated.id).toBe(id);
    expect(updated.content).toBe("overwritten");
  });

  it("update() changes specified fields", () => {
    const id = randomUUID();
    repo.create({
      id,
      content: "original",
      type: "fact",
      tags: ["old"],
      sourceHarness: null,
      embedding: makeEmbedding(0),
    });

    const updated = repo.update(id, { content: "changed", tags: ["new"] }, makeEmbedding(1));
    expect(updated.content).toBe("changed");
    expect(updated.tags).toEqual(["new"]);
  });

  it("update() throws when memory not found", () => {
    expect(() => repo.update("nonexistent", { type: "fact" })).toThrow("Memory not found");
  });

  it("delete() removes the memory", () => {
    const id = randomUUID();
    repo.create({
      id,
      content: "to delete",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
    });

    expect(repo.list()).toHaveLength(1);
    repo.delete(id);
    expect(repo.list()).toHaveLength(0);
  });

  it("createReviewEvent() and listReviewEvents() round-trip", () => {
    const memId = randomUUID();
    const conflictId = randomUUID();

    repo.create({
      id: memId,
      content: "A",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
    });
    repo.create({
      id: conflictId,
      content: "B",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(1),
    });

    repo.createReviewEvent({
      memoryId: memId,
      conflictingMemoryId: conflictId,
      similarity: 0.85,
      conflictContentSnapshot: "B",
    });

    const events = repo.listReviewEvents(memId);
    expect(events).toHaveLength(1);
    expect(events[0]?.memoryId).toBe(memId);
    expect(events[0]?.conflictingMemoryId).toBe(conflictId);
    expect(events[0]?.similarity).toBe(0.85);
    expect(events[0]?.reason).toBe("similarity_dedup");
    expect(events[0]?.resolvedAt).toBeNull();
  });

  it("resolveReviewEvents() marks events as resolved", () => {
    const memId = randomUUID();
    const conflictId = randomUUID();

    repo.create({
      id: memId,
      content: "A",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
    });
    repo.create({
      id: conflictId,
      content: "B",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(1),
    });
    repo.createReviewEvent({
      memoryId: memId,
      conflictingMemoryId: conflictId,
      similarity: 0.85,
      conflictContentSnapshot: "B",
    });

    repo.resolveReviewEvents(memId);

    const unresolvedEvents = repo.listReviewEvents(memId, { unresolvedOnly: true });
    expect(unresolvedEvents).toHaveLength(0);

    const allEvents = repo.listReviewEvents(memId);
    expect(allEvents).toHaveLength(1);
    expect(allEvents[0]?.resolvedAt).toBeTruthy();
  });

  it("setPin() and getPinnedCharCount() work correctly", () => {
    const id = randomUUID();
    repo.create({
      id,
      content: "hello world",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
    });

    expect(repo.getPinnedCharCount()).toBe(0);
    repo.setPin(id, true);
    expect(repo.getPinnedCharCount()).toBe("hello world".length);
    repo.setPin(id, false);
    expect(repo.getPinnedCharCount()).toBe(0);
  });

  it("stats() aggregates correctly", () => {
    repo.create({
      id: randomUUID(),
      content: "A",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
    });
    repo.create({
      id: randomUUID(),
      content: "B",
      type: "preference",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(1),
    });

    const stats = repo.stats();
    expect(stats.total).toBe(2);
    expect(stats.byType.fact).toBe(1);
    expect(stats.byType.preference).toBe(1);
    expect(stats.pinned).toBe(0);
  });

  it("listFlagged() with limit caps returned results", () => {
    const conflictId = randomUUID();
    repo.create({
      id: conflictId,
      content: "conflict anchor",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(10),
    });

    for (let i = 0; i < 3; i++) {
      const id = randomUUID();
      repo.create({
        id,
        content: `memory ${i}`,
        type: "fact",
        tags: [],
        sourceHarness: null,
        embedding: makeEmbedding(i),
      });
      repo.createReviewEvent({
        memoryId: id,
        conflictingMemoryId: conflictId,
        similarity: 0.8,
        conflictContentSnapshot: `other ${i}`,
      });
    }

    const results = repo.listFlagged({ limit: 2 });
    expect(results).toHaveLength(2);
  });

  it("listFlagged() with minSimilarity filters by review event similarity", () => {
    const conflictId = randomUUID();
    repo.create({
      id: conflictId,
      content: "conflict anchor",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(10),
    });

    const lowId = randomUUID();
    const highId = randomUUID();

    repo.create({
      id: lowId,
      content: "low similarity memory",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
    });
    repo.createReviewEvent({
      memoryId: lowId,
      conflictingMemoryId: conflictId,
      similarity: 0.78,
      conflictContentSnapshot: "other",
    });

    repo.create({
      id: highId,
      content: "high similarity memory",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(1),
    });
    repo.createReviewEvent({
      memoryId: highId,
      conflictingMemoryId: conflictId,
      similarity: 0.91,
      conflictContentSnapshot: "other",
    });

    const results = repo.listFlagged({ minSimilarity: 0.85 });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(highId);
  });

  it("listFlagged() with maxSimilarity filters by review event similarity", () => {
    const conflictId = randomUUID();
    repo.create({
      id: conflictId,
      content: "conflict anchor",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(10),
    });

    const lowId = randomUUID();
    const highId = randomUUID();

    repo.create({
      id: lowId,
      content: "low similarity memory",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
    });
    repo.createReviewEvent({
      memoryId: lowId,
      conflictingMemoryId: conflictId,
      similarity: 0.78,
      conflictContentSnapshot: "other",
    });

    repo.create({
      id: highId,
      content: "high similarity memory",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(1),
    });
    repo.createReviewEvent({
      memoryId: highId,
      conflictingMemoryId: conflictId,
      similarity: 0.91,
      conflictContentSnapshot: "other",
    });

    const results = repo.listFlagged({ maxSimilarity: 0.85 });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(lowId);
  });

  it("incrementAccessCount() increments the counter", () => {
    const id = randomUUID();
    repo.create({
      id,
      content: "A",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
    });

    repo.incrementAccessCount(id);
    repo.incrementAccessCount(id);

    const row = db.db
      .prepare<[string], { access_count: number }>("SELECT access_count FROM memories WHERE id = ?")
      .get(id) as { access_count: number };
    expect(row.access_count).toBe(2);
  });

  it("incrementAccessCountBy() increments the counter by the given delta", () => {
    const id = randomUUID();
    repo.create({
      id,
      content: "B",
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
    });

    repo.incrementAccessCountBy(id, 5);

    const row = db.db
      .prepare<[string], { access_count: number }>("SELECT access_count FROM memories WHERE id = ?")
      .get(id) as { access_count: number };
    expect(row.access_count).toBe(5);
  });

  it("atomicMerge() updates kept memory and deletes dropped memories", () => {
    const id1 = randomUUID();
    const id2 = randomUUID();

    repo.create({
      id: id1,
      content: "original keep",
      type: "fact",
      tags: ["a"],
      sourceHarness: null,
      embedding: makeEmbedding(0),
    });
    repo.create({
      id: id2,
      content: "original drop",
      type: "fact",
      tags: ["b"],
      sourceHarness: null,
      embedding: makeEmbedding(1),
    });

    const result = repo.atomicMerge({
      keepId: id1,
      mergedContent: "merged",
      embedding: makeEmbedding(2),
      tags: ["a", "b"],
      pinned: false,
      accessCount: 5,
      deleteIds: [id2],
    });

    expect(result.content).toBe("merged");
    expect(result.accessCount).toBe(5);
    expect(result.tags).toEqual(["a", "b"]);
    expect(repo.findById(id2)).toBeUndefined();
    expect(repo.findById(id1)?.content).toBe("merged");
  });
});
