import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseManager } from "../db/manager.js";
import type { EmbeddingService } from "../embedding/service.js";
import type { MemoryRepository } from "../memory/repository.js";
import { QueryEngine } from "./engine.js";

function unitVec(dim: number, size = 384): Float32Array {
  const v = new Float32Array(size).fill(0);
  v[dim] = 1;
  return v;
}

interface InsertMemoryOptions {
  id: string;
  content: string;
  type: string;
  tags?: string[];
  source?: string | null;
  accessCount?: number;
  pinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
  embedding: Float32Array;
}

function insertMemory(db: DatabaseManager, opts: InsertMemoryOptions): void {
  const now = new Date().toISOString();
  db.db
    .prepare(
      `INSERT INTO memories (id, content, type, tags, source, access_count, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      opts.id,
      opts.content,
      opts.type,
      JSON.stringify(opts.tags ?? []),
      opts.source ?? null,
      opts.accessCount ?? 0,
      opts.pinned ? 1 : 0,
      opts.createdAt ?? now,
      opts.updatedAt ?? now
    );

  db.db
    .prepare(
      `INSERT INTO embeddings (rowid, embedding) SELECT m.rowid, ? FROM memories m WHERE m.id = ?`
    )
    .run(Buffer.from(opts.embedding.buffer), opts.id);
}

function insertProject(db: DatabaseManager, scopeHash: string): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.db
    .prepare(
      `INSERT INTO projects (id, name, scope_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, `project-${scopeHash.slice(0, 8)}`, scopeHash, now, now);
  return id;
}

function associateMemoryProject(db: DatabaseManager, memoryId: string, projectId: string): void {
  db.db
    .prepare(`INSERT INTO memory_projects (memory_id, project_id) VALUES (?, ?)`)
    .run(memoryId, projectId);
}

describe("QueryEngine", () => {
  let dbManager: DatabaseManager;
  let embeddingStub: EmbeddingService;
  let repoStub: Pick<MemoryRepository, "incrementAccessCount">;
  let engine: QueryEngine;

  beforeEach(() => {
    dbManager = DatabaseManager.openInMemory();
    embeddingStub = { embed: vi.fn() } as unknown as EmbeddingService;
    repoStub = { incrementAccessCount: vi.fn() };
    engine = new QueryEngine(dbManager, embeddingStub, repoStub as MemoryRepository);
  });

  it("returns empty array when no memories exist", async () => {
    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const results = await engine.query({ query: "anything" });

    expect(results).toEqual([]);
  });

  it("returns results ordered by score DESC (correction beats fact via type weight)", async () => {
    // Both memories get cosine_sim = 1.0 (same vector as query)
    insertMemory(dbManager, {
      id: "fact-1",
      content: "Some fact",
      type: "fact",
      embedding: unitVec(0),
    });
    insertMemory(dbManager, {
      id: "correction-1",
      content: "A correction",
      type: "correction",
      embedding: unitVec(0),
    });

    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const results = await engine.query({ query: "test" });

    expect(results.length).toBe(2);
    expect(results[0]?.id).toBe("correction-1");
    expect(results[1]?.id).toBe("fact-1");
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("type filter returns only memories of the specified type", async () => {
    insertMemory(dbManager, {
      id: "correction-1",
      content: "A correction",
      type: "correction",
      embedding: unitVec(0),
    });
    insertMemory(dbManager, {
      id: "preference-1",
      content: "A preference",
      type: "preference",
      embedding: unitVec(0),
    });

    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const results = await engine.query({ query: "test", type: "correction" });

    expect(results.length).toBe(1);
    expect(results[0]?.type).toBe("correction");
    expect(results[0]?.id).toBe("correction-1");
  });

  it("projectHash filter returns only memories associated with that project", async () => {
    insertMemory(dbManager, {
      id: "global-1",
      content: "Global memory",
      type: "fact",
      embedding: unitVec(0),
    });
    insertMemory(dbManager, {
      id: "project-1",
      content: "Project memory",
      type: "fact",
      embedding: unitVec(0),
    });

    const projId = insertProject(dbManager, "project-abc");
    associateMemoryProject(dbManager, "project-1", projId);

    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const results = await engine.query({ query: "test", projectHash: "project-abc" });

    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe("project-1");
  });

  it("calls incrementAccessCount once per result", async () => {
    insertMemory(dbManager, {
      id: "mem-1",
      content: "Memory one",
      type: "fact",
      embedding: unitVec(0),
    });
    insertMemory(dbManager, {
      id: "mem-2",
      content: "Memory two",
      type: "fact",
      embedding: unitVec(0),
    });

    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const results = await engine.query({ query: "test" });

    expect(results.length).toBe(2);
    expect(repoStub.incrementAccessCount).toHaveBeenCalledTimes(2);
    expect(repoStub.incrementAccessCount).toHaveBeenCalledWith("mem-1");
    expect(repoStub.incrementAccessCount).toHaveBeenCalledWith("mem-2");
  });

  it("each result has a score field", async () => {
    insertMemory(dbManager, {
      id: "mem-1",
      content: "A memory",
      type: "preference",
      embedding: unitVec(0),
    });

    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const results = await engine.query({ query: "test" });

    expect(results.length).toBe(1);
    expect(typeof results[0]?.score).toBe("number");
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it("respects the limit option", async () => {
    for (let i = 0; i < 5; i++) {
      insertMemory(dbManager, {
        id: `mem-${i}`,
        content: `Memory ${i}`,
        type: "fact",
        embedding: unitVec(0),
      });
    }

    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const results = await engine.query({ query: "test", limit: 3 });

    expect(results.length).toBe(3);
  });

  it("correction ranks above preference at identical cosine similarity", async () => {
    insertMemory(dbManager, {
      id: "preference-1",
      content: "A preference",
      type: "preference",
      pinned: false,
      embedding: unitVec(0),
    });
    insertMemory(dbManager, {
      id: "correction-1",
      content: "A correction",
      type: "correction",
      pinned: false,
      embedding: unitVec(0),
    });

    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const results = await engine.query({ query: "test" });

    expect(results.length).toBe(2);
    expect(results[0]?.id).toBe("correction-1");
    expect(results[1]?.id).toBe("preference-1");
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("pinned memory is excluded by default", async () => {
    insertMemory(dbManager, {
      id: "unpinned-1",
      content: "Unpinned fact",
      type: "fact",
      pinned: false,
      embedding: unitVec(0),
    });
    insertMemory(dbManager, {
      id: "pinned-1",
      content: "Pinned fact",
      type: "fact",
      pinned: true,
      embedding: unitVec(0),
    });

    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const results = await engine.query({ query: "test" });

    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe("unpinned-1");
  });

  it("includePinned=true returns pinned memories and they rank above unpinned at identical similarity", async () => {
    insertMemory(dbManager, {
      id: "unpinned-1",
      content: "Unpinned fact",
      type: "fact",
      pinned: false,
      embedding: unitVec(0),
    });
    insertMemory(dbManager, {
      id: "pinned-1",
      content: "Pinned fact",
      type: "fact",
      pinned: true,
      embedding: unitVec(0),
    });

    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const results = await engine.query({ query: "test", includePinned: true });

    expect(results.length).toBe(2);
    expect(results[0]?.id).toBe("pinned-1");
    expect(results[1]?.id).toBe("unpinned-1");
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("filters out memories with cosine_sim <= 0 (orthogonal embeddings excluded)", async () => {
    // Insert a memory with embedding at dimension 1
    insertMemory(dbManager, {
      id: "orthogonal-1",
      content: "Orthogonal memory",
      type: "fact",
      embedding: unitVec(1),
    });

    // Query with embedding at dimension 0 — cosine_sim = 0
    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const results = await engine.query({ query: "test" });

    expect(results).toEqual([]);
  });
});
