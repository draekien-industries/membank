import type { EmbeddingService } from "@membank/core";
import { DatabaseManager, MemoryRepository, ProjectRepository } from "@membank/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pinCommand } from "./pin.js";
import { unpinCommand } from "./unpin.js";

function unitVec(dim: number, size = 384): Float32Array {
  const v = new Float32Array(size).fill(0);
  v[dim] = 1;
  return v;
}

function captureStdout(fn: () => void): string {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join("");
}

async function insertMemory(db: DatabaseManager, embeddingStub: EmbeddingService): Promise<string> {
  const repo = new MemoryRepository(db, embeddingStub, new ProjectRepository(db));
  const memory = await repo.save({ content: "test content", type: "fact" });
  return memory.id;
}

describe("pin command — real in-memory SQLite", () => {
  let db: DatabaseManager;
  let embeddingStub: EmbeddingService;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    embeddingStub = { embed: vi.fn() } as unknown as EmbeddingService;
    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));
  });

  it("sets pinned to true and prints confirmation", async () => {
    const id = await insertMemory(db, embeddingStub);

    const output = captureStdout(() => pinCommand(id, db));

    expect(output).toContain(`Pinned: ${id}`);

    const row = db.db
      .prepare<[string], { pinned: number }>("SELECT pinned FROM memories WHERE id = ?")
      .get(id);
    expect(row?.pinned).toBe(1);
  });

  it("throws for unknown id", () => {
    expect(() => pinCommand("nonexistent-id", db)).toThrow("Memory not found: nonexistent-id");
  });
});

describe("unpin command — real in-memory SQLite", () => {
  let db: DatabaseManager;
  let embeddingStub: EmbeddingService;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    embeddingStub = { embed: vi.fn() } as unknown as EmbeddingService;
    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));
  });

  it("sets pinned to false and prints confirmation", async () => {
    const id = await insertMemory(db, embeddingStub);

    db.db.prepare("UPDATE memories SET pinned = 1 WHERE id = ?").run(id);

    const output = captureStdout(() => unpinCommand(id, db));

    expect(output).toContain(`Unpinned: ${id}`);

    const row = db.db
      .prepare<[string], { pinned: number }>("SELECT pinned FROM memories WHERE id = ?")
      .get(id);
    expect(row?.pinned).toBe(0);
  });

  it("throws for unknown id", () => {
    expect(() => unpinCommand("nonexistent-id", db)).toThrow("Memory not found: nonexistent-id");
  });
});
