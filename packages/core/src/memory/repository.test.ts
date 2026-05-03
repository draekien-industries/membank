import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseManager } from "../db/manager.js";
import type { EmbeddingService } from "../embedding/service.js";
import { ProjectRepository } from "../project/repository.js";
import { MemoryRepository } from "./repository.js";

// Build a unit-vector embedding seeded at a specific dimension index.
function makeUnitVector(dimension: number): Float32Array {
  const arr = new Float32Array(384).fill(0);
  arr[dimension] = 1;
  return arr;
}

// Build a normalised embedding where arr[0] = cos(theta), arr[1] = sin(theta).
// Two such vectors with angles theta1 and theta2 give similarity = cos(theta1 - theta2).
function makeAngleVector(theta: number): Float32Array {
  const arr = new Float32Array(384).fill(0);
  arr[0] = Math.cos(theta);
  arr[1] = Math.sin(theta);
  return arr;
}

function makeStubEmbedding(seed: number): Float32Array {
  const arr = new Float32Array(384).fill(0);
  arr[0] = seed;
  const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
  return arr.map((v) => v / norm);
}

function countRows(db: DatabaseManager): number {
  const row = db.db
    .prepare<[], { count: number }>("SELECT count(*) AS count FROM memories")
    .get() as { count: number };
  return row.count;
}

describe("MemoryRepository", () => {
  let dbManager: DatabaseManager;
  let embeddingStub: EmbeddingService;
  let projectRepo: ProjectRepository;
  let repo: MemoryRepository;

  beforeEach(() => {
    dbManager = DatabaseManager.openInMemory();
    embeddingStub = { embed: vi.fn() } as unknown as EmbeddingService;
    projectRepo = new ProjectRepository(dbManager);
    repo = new MemoryRepository(dbManager, embeddingStub, projectRepo);
  });

  it("save() inserts a new memory when no similar exists", async () => {
    vi.mocked(embeddingStub.embed).mockResolvedValue(makeUnitVector(0));

    const memory = await repo.save({
      content: "Use tabs for indentation",
      type: "preference",
    });

    expect(countRows(dbManager)).toBe(1);
    expect(memory.id).toBeTruthy();
    expect(memory.content).toBe("Use tabs for indentation");
    expect(memory.type).toBe("preference");
    expect(memory.projects).toEqual([]);
    expect(memory.tags).toEqual([]);
    expect(memory.pinned).toBe(false);
    expect(memory.needsReview).toBe(false);
    expect(memory.accessCount).toBe(0);
  });

  it("save() returns Memory with correct shape (tags as array, booleans, etc.)", async () => {
    vi.mocked(embeddingStub.embed).mockResolvedValue(makeUnitVector(0));

    const memory = await repo.save({
      content: "Always write tests",
      type: "correction",
      tags: ["testing", "quality"],
      projectScope: { hash: "abc123", name: "test-project" },
      sourceHarness: "claude",
    });

    expect(Array.isArray(memory.tags)).toBe(true);
    expect(memory.tags).toEqual(["testing", "quality"]);
    expect(typeof memory.pinned).toBe("boolean");
    expect(typeof memory.needsReview).toBe("boolean");
    expect(typeof memory.accessCount).toBe("number");
    expect(memory.projects).toHaveLength(1);
    expect(memory.projects[0]?.scopeHash).toBe("abc123");
    expect(memory.sourceHarness).toBe("claude");
    expect(memory.createdAt).toBeTruthy();
    expect(memory.updatedAt).toBeTruthy();
  });

  it("save() overwrites existing when similarity > 0.92 — single record, created_at preserved, updated_at changed", async () => {
    // Identical embeddings → similarity = 1.0
    const vec = makeStubEmbedding(1);
    vi.mocked(embeddingStub.embed).mockResolvedValue(vec);

    const first = await repo.save({ content: "Original content", type: "preference" });

    // Small delay to ensure updated_at differs
    await new Promise((r) => setTimeout(r, 5));

    vi.mocked(embeddingStub.embed).mockResolvedValue(vec);
    const second = await repo.save({ content: "Updated content", type: "preference" });

    expect(countRows(dbManager)).toBe(1);
    expect(second.id).toBe(first.id);
    expect(second.content).toBe("Updated content");
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).not.toBe(first.updatedAt);
  });

  it("save() inserts new AND flags existing when 0.75 ≤ similarity ≤ 0.92", async () => {
    // First vector: angle = 0 → [1, 0, ...]
    const vecA = makeAngleVector(0);
    vi.mocked(embeddingStub.embed).mockResolvedValue(vecA);
    const first = await repo.save({ content: "First memory", type: "learning" });

    // Second vector at angle = acos(0.85) → similarity with first = 0.85
    const theta = Math.acos(0.85);
    const vecB = makeAngleVector(theta);
    vi.mocked(embeddingStub.embed).mockResolvedValue(vecB);
    const second = await repo.save({ content: "Similar memory", type: "learning" });

    expect(countRows(dbManager)).toBe(2);
    expect(second.id).not.toBe(first.id);
    expect(second.needsReview).toBe(false);

    // Existing record must now have needs_review = true
    const existingRow = dbManager.db
      .prepare<[string], { needs_review: number }>("SELECT needs_review FROM memories WHERE id = ?")
      .get(first.id) as { needs_review: number };
    expect(existingRow.needs_review).toBe(1);
  });

  it("save() inserts distinct record when similarity < 0.75", async () => {
    // Orthogonal vectors → similarity = 0.0
    vi.mocked(embeddingStub.embed).mockResolvedValue(makeUnitVector(0));
    await repo.save({ content: "Memory A", type: "fact" });

    vi.mocked(embeddingStub.embed).mockResolvedValue(makeUnitVector(1));
    const second = await repo.save({ content: "Memory B", type: "fact" });

    expect(countRows(dbManager)).toBe(2);
    expect(second.needsReview).toBe(false);
  });

  it("update() updates content+tags, regenerates embedding, refreshes updated_at, preserves created_at and access_count", async () => {
    vi.mocked(embeddingStub.embed).mockResolvedValue(makeUnitVector(0));
    const original = await repo.save({
      content: "Old content",
      type: "decision",
      tags: ["old"],
    });

    // Increment access count before updating to verify it's preserved
    repo.incrementAccessCount(original.id);

    await new Promise((r) => setTimeout(r, 5));

    const newVec = makeUnitVector(2);
    vi.mocked(embeddingStub.embed).mockResolvedValue(newVec);

    const updated = await repo.update(original.id, {
      content: "New content",
      tags: ["new", "updated"],
    });

    expect(updated.id).toBe(original.id);
    expect(updated.content).toBe("New content");
    expect(updated.tags).toEqual(["new", "updated"]);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.updatedAt).not.toBe(original.updatedAt);
    expect(updated.accessCount).toBe(1);

    // embed should have been called for save (1) + update (1)
    expect(embeddingStub.embed).toHaveBeenCalledTimes(2);
  });

  it("delete() removes the record; DB count decreases by 1", async () => {
    vi.mocked(embeddingStub.embed).mockResolvedValue(makeUnitVector(0));
    const memory = await repo.save({ content: "To be deleted", type: "fact" });

    expect(countRows(dbManager)).toBe(1);

    await repo.delete(memory.id);

    expect(countRows(dbManager)).toBe(0);
  });

  it("incrementAccessCount() increments the counter in DB", async () => {
    vi.mocked(embeddingStub.embed).mockResolvedValue(makeUnitVector(0));
    const memory = await repo.save({ content: "Some memory", type: "fact" });
    expect(memory.accessCount).toBe(0);

    repo.incrementAccessCount(memory.id);
    repo.incrementAccessCount(memory.id);

    const row = dbManager.db
      .prepare<[string], { access_count: number }>("SELECT access_count FROM memories WHERE id = ?")
      .get(memory.id) as { access_count: number };

    expect(row.access_count).toBe(2);
  });
});
