import type { EmbeddingService } from "@membank/core";
import { DatabaseManager, MemoryRepository } from "@membank/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Formatter } from "../formatter.js";
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

function captureStderr(fn: () => void): string {
  const chunks: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stderr.write = original;
  }
  return chunks.join("");
}

async function insertMemory(db: DatabaseManager, embeddingStub: EmbeddingService): Promise<string> {
  const repo = new MemoryRepository(db, embeddingStub);
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
    const formatter = new Formatter(false);

    const output = captureStdout(() => pinCommand(id, formatter, db));

    expect(output).toContain(`Pinned: ${id}`);

    const row = db.db
      .prepare<[string], { pinned: number }>("SELECT pinned FROM memories WHERE id = ?")
      .get(id);
    expect(row?.pinned).toBe(1);
  });

  it("prints error and exits for unknown id", async () => {
    const formatter = new Formatter(false);

    let exitCode: number | undefined;
    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      exitCode = code;
    }) as typeof process.exit;

    try {
      const stderrOutput = captureStderr(() => pinCommand("nonexistent-id", formatter, db));
      expect(stderrOutput).toContain("nonexistent-id");
      expect(exitCode).toBe(2);
    } finally {
      process.exit = origExit;
    }
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

    // First pin it
    db.db.prepare("UPDATE memories SET pinned = 1 WHERE id = ?").run(id);

    const formatter = new Formatter(false);
    const output = captureStdout(() => unpinCommand(id, formatter, db));

    expect(output).toContain(`Unpinned: ${id}`);

    const row = db.db
      .prepare<[string], { pinned: number }>("SELECT pinned FROM memories WHERE id = ?")
      .get(id);
    expect(row?.pinned).toBe(0);
  });

  it("prints error and exits for unknown id", async () => {
    const formatter = new Formatter(false);

    let exitCode: number | undefined;
    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      exitCode = code;
    }) as typeof process.exit;

    try {
      const stderrOutput = captureStderr(() => unpinCommand("nonexistent-id", formatter, db));
      expect(stderrOutput).toContain("nonexistent-id");
      expect(exitCode).toBe(2);
    } finally {
      process.exit = origExit;
    }
  });
});
