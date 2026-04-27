import type { EmbeddingService, Memory } from "@membank/core";
import { DatabaseManager, MemoryRepository, QueryEngine } from "@membank/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Formatter } from "../formatter.js";

function unitVec(dim: number, size = 384): Float32Array {
  const v = new Float32Array(size).fill(0);
  v[dim] = 1;
  return v;
}

interface InsertOpts {
  id: string;
  content: string;
  type: string;
  tags?: string[];
  scope?: string;
  embedding: Float32Array;
}

function insertMemory(db: DatabaseManager, opts: InsertOpts): void {
  const now = new Date().toISOString();
  db.db
    .prepare(
      `INSERT INTO memories (id, content, type, tags, scope, source, access_count, pinned, needs_review, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      opts.id,
      opts.content,
      opts.type,
      JSON.stringify(opts.tags ?? []),
      opts.scope ?? "global",
      null,
      0,
      0,
      0,
      now,
      now
    );

  db.db
    .prepare(
      `INSERT INTO embeddings (rowid, embedding) SELECT m.rowid, ? FROM memories m WHERE m.id = ?`
    )
    .run(Buffer.from(opts.embedding.buffer), opts.id);
}

async function captureStdoutAsync(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  };
  return fn()
    .then(() => chunks.join(""))
    .finally(() => {
      process.stdout.write = original;
    });
}

type QueryResult = Memory & { score: number };

describe("query command integration — real in-memory SQLite", () => {
  let db: DatabaseManager;
  let embeddingStub: EmbeddingService;
  let repo: MemoryRepository;
  let engine: QueryEngine;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    embeddingStub = { embed: vi.fn() } as unknown as EmbeddingService;
    repo = new MemoryRepository(db, embeddingStub);
    engine = new QueryEngine(db, embeddingStub, repo);
  });

  it("results include id, type, content, tags, scope in human output", async () => {
    insertMemory(db, {
      id: "pref-1",
      content: "Use TypeScript strict mode",
      type: "preference",
      tags: ["typescript", "config"],
      scope: "global",
      embedding: unitVec(0),
    });

    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const formatter = new Formatter(false);
    const output = await captureStdoutAsync(async () => {
      const results = await engine.query({ query: "typescript preferences" });
      formatter.outputQueryResults(results);
    });

    expect(output).toContain("pref-1");
    expect(output).toContain("preference");
    expect(output).toContain("Use TypeScript strict mode");
    expect(output).toContain("typescript");
    expect(output).toContain("config");
    expect(output).toContain("global");
  });

  it("--json flag: outputs JSON array with no decorative text", async () => {
    insertMemory(db, {
      id: "pref-2",
      content: "Prefer const over let",
      type: "preference",
      tags: [],
      scope: "global",
      embedding: unitVec(0),
    });

    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const formatter = new Formatter(true);
    const output = await captureStdoutAsync(async () => {
      const results = await engine.query({ query: "typescript preferences" });
      formatter.outputQueryResults(results);
    });

    const parsed = JSON.parse(output) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    const trimmed = output.trim();
    expect(trimmed).toBe(JSON.stringify(parsed));
  });

  it("--type correction: returns only memories of type correction", async () => {
    insertMemory(db, {
      id: "correction-1",
      content: "Always use semicolons",
      type: "correction",
      embedding: unitVec(0),
    });
    insertMemory(db, {
      id: "preference-1",
      content: "Prefer functional style",
      type: "preference",
      embedding: unitVec(0),
    });

    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const results: QueryResult[] = await engine.query({ query: "code style", type: "correction" });

    expect(results.every((r: QueryResult) => r.type === "correction")).toBe(true);
    expect(results.some((r: QueryResult) => r.id === "correction-1")).toBe(true);
    expect(results.every((r: QueryResult) => r.id !== "preference-1")).toBe(true);
  });

  it("results are ranked by score descending", async () => {
    insertMemory(db, {
      id: "fact-1",
      content: "Some fact",
      type: "fact",
      embedding: unitVec(0),
    });
    insertMemory(db, {
      id: "correction-1",
      content: "A correction",
      type: "correction",
      embedding: unitVec(0),
    });

    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const results = await engine.query({ query: "test" });

    expect(results.length).toBeGreaterThan(1);
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];
      if (prev !== undefined && curr !== undefined) {
        expect(prev.score).toBeGreaterThanOrEqual(curr.score);
      }
    }
  });

  it("JSON output for empty results is an empty array", async () => {
    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const formatter = new Formatter(true);
    const output = await captureStdoutAsync(async () => {
      const results = await engine.query({ query: "nothing" });
      formatter.outputQueryResults(results);
    });

    const parsed = JSON.parse(output) as unknown[];
    expect(parsed).toEqual([]);
  });

  it("each result has a score field", async () => {
    insertMemory(db, {
      id: "mem-1",
      content: "A memory",
      type: "fact",
      embedding: unitVec(0),
    });

    vi.mocked(embeddingStub.embed).mockResolvedValue(unitVec(0));

    const results = await engine.query({ query: "test" });

    expect(results.length).toBe(1);
    expect(typeof results[0]?.score).toBe("number");
  });

  it("non-TTY stdout means Formatter.create() is in JSON mode", () => {
    const saved = process.stdout.isTTY;
    process.stdout.isTTY = undefined as unknown as true;
    try {
      const f = Formatter.create();
      expect(f.isJson).toBe(true);
    } finally {
      process.stdout.isTTY = saved;
    }
  });
});
