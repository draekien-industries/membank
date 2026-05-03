import type { EmbeddingService } from "@membank/core";
import { DatabaseManager, MemoryRepository, ProjectRepository } from "@membank/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Formatter } from "../formatter.js";

interface InsertOpts {
  id: string;
  content: string;
  type: string;
  needsReview?: boolean;
}

function insertMemory(db: DatabaseManager, opts: InsertOpts): void {
  const now = new Date().toISOString();
  db.db
    .prepare(
      `INSERT INTO memories (id, content, type, tags, source, access_count, pinned, needs_review, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      opts.id,
      opts.content,
      opts.type,
      JSON.stringify([]),
      null,
      0,
      0,
      opts.needsReview === true ? 1 : 0,
      now,
      now
    );
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

describe("stats command integration — real in-memory SQLite", () => {
  let db: DatabaseManager;
  let repo: MemoryRepository;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    const embeddingStub = { embed: vi.fn() } as unknown as EmbeddingService;
    repo = new MemoryRepository(db, embeddingStub, new ProjectRepository(db));
  });

  it("stats returns correct counts per type", () => {
    insertMemory(db, { id: "c1", content: "Correction 1", type: "correction" });
    insertMemory(db, { id: "c2", content: "Correction 2", type: "correction" });
    insertMemory(db, { id: "p1", content: "Preference 1", type: "preference" });
    insertMemory(db, { id: "f1", content: "Fact 1", type: "fact" });

    const stats = repo.stats();

    expect(stats.byType.correction).toBe(2);
    expect(stats.byType.preference).toBe(1);
    expect(stats.byType.fact).toBe(1);
    expect(stats.byType.decision).toBe(0);
    expect(stats.byType.learning).toBe(0);
    expect(stats.total).toBe(4);
  });

  it("stats returns correct needsReview count", () => {
    insertMemory(db, {
      id: "r1",
      content: "Needs review 1",
      type: "preference",
      needsReview: true,
    });
    insertMemory(db, {
      id: "r2",
      content: "Needs review 2",
      type: "correction",
      needsReview: true,
    });
    insertMemory(db, { id: "ok1", content: "Fine memory", type: "fact", needsReview: false });

    const stats = repo.stats();

    expect(stats.needsReview).toBe(2);
    expect(stats.total).toBe(3);
  });

  it("stats returns zeros when no memories exist", () => {
    const stats = repo.stats();

    expect(stats.total).toBe(0);
    expect(stats.needsReview).toBe(0);
    expect(stats.byType.correction).toBe(0);
    expect(stats.byType.preference).toBe(0);
    expect(stats.byType.decision).toBe(0);
    expect(stats.byType.learning).toBe(0);
    expect(stats.byType.fact).toBe(0);
  });

  it("outputStats human mode prints type counts, total, and needs_review", () => {
    insertMemory(db, { id: "c1", content: "Correction", type: "correction" });
    insertMemory(db, { id: "p1", content: "Preference", type: "preference", needsReview: true });

    const stats = repo.stats();
    const formatter = new Formatter(false);
    const output = captureStdout(() => formatter.outputStats(stats));

    expect(output).toContain("correction");
    expect(output).toContain("preference");
    expect(output).toContain("total");
    expect(output).toContain("needs_review");
    expect(output).toContain("2"); // total
    expect(output).toContain("1"); // needsReview
  });

  it("outputStats JSON mode returns object with byType, total, needsReview", () => {
    insertMemory(db, { id: "d1", content: "A decision", type: "decision" });
    insertMemory(db, { id: "l1", content: "A learning", type: "learning", needsReview: true });

    const stats = repo.stats();
    const formatter = new Formatter(true);
    const output = captureStdout(() => formatter.outputStats(stats));

    const parsed = JSON.parse(output) as {
      byType: Record<string, number>;
      total: number;
      needsReview: number;
    };

    expect(parsed.total).toBe(2);
    expect(parsed.needsReview).toBe(1);
    expect(parsed.byType.decision).toBe(1);
    expect(parsed.byType.learning).toBe(1);
    expect(parsed.byType.correction).toBe(0);
  });
});
