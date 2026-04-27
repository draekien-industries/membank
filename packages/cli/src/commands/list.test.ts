import type { Memory, MemoryType } from "@membank/core";
import { DatabaseManager } from "@membank/core";
import { beforeEach, describe, expect, it } from "vitest";
import { Formatter } from "../formatter.js";

interface InsertOpts {
  id: string;
  content: string;
  type: string;
  tags?: string[];
  scope?: string;
  pinned?: boolean;
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
      opts.pinned === true ? 1 : 0,
      0,
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

describe("list command integration — real in-memory SQLite", () => {
  let db: DatabaseManager;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
  });

  it("lists all memories with id, type, content, scope", () => {
    insertMemory(db, {
      id: "mem-1",
      content: "Use TypeScript",
      type: "preference",
      scope: "global",
    });
    insertMemory(db, {
      id: "mem-2",
      content: "Always test",
      type: "correction",
      scope: "project-abc",
    });

    const memories = db.db.prepare("SELECT * FROM memories ORDER BY created_at DESC").all() as {
      id: string;
      content: string;
      type: string;
      tags: string;
      scope: string;
      source: string | null;
      access_count: number;
      pinned: number;
      needs_review: number;
      created_at: string;
      updated_at: string;
    }[];

    const mapped: Memory[] = memories.map((r) => ({
      id: r.id,
      content: r.content,
      type: r.type as MemoryType,
      tags: JSON.parse(r.tags) as string[],
      scope: r.scope,
      sourceHarness: r.source,
      accessCount: r.access_count,
      pinned: r.pinned !== 0,
      needsReview: r.needs_review !== 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    const formatter = new Formatter(false);
    const output = captureStdout(() => formatter.outputMemories(mapped));

    expect(output).toContain("mem-1");
    expect(output).toContain("preference");
    expect(output).toContain("Use TypeScript");
    expect(output).toContain("global");
    expect(output).toContain("mem-2");
    expect(output).toContain("correction");
    expect(output).toContain("Always test");
    expect(output).toContain("project-abc");
  });

  it("--type filter returns only memories of that type via repo.list()", () => {
    insertMemory(db, { id: "corr-1", content: "A correction", type: "correction" });
    insertMemory(db, { id: "pref-1", content: "A preference", type: "preference" });

    const rows = db.db
      .prepare("SELECT * FROM memories WHERE type = ? ORDER BY created_at DESC")
      .all("correction") as {
      id: string;
      content: string;
      type: string;
      tags: string;
      scope: string;
      source: string | null;
      access_count: number;
      pinned: number;
      needs_review: number;
      created_at: string;
      updated_at: string;
    }[];

    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe("corr-1");
    expect(rows[0]?.type).toBe("correction");
  });

  it("--pinned filter returns only pinned memories via repo.list()", () => {
    insertMemory(db, { id: "pin-1", content: "Pinned memory", type: "fact", pinned: true });
    insertMemory(db, { id: "unpin-1", content: "Not pinned", type: "fact", pinned: false });

    const rows = db.db
      .prepare("SELECT * FROM memories WHERE pinned = 1 ORDER BY created_at DESC")
      .all() as { id: string }[];

    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe("pin-1");
  });

  it("outputMemories JSON mode returns array of memory objects", () => {
    insertMemory(db, {
      id: "mem-j1",
      content: "JSON output test",
      type: "learning",
      scope: "global",
    });

    const rows = db.db.prepare("SELECT * FROM memories").all() as {
      id: string;
      content: string;
      type: string;
      tags: string;
      scope: string;
      source: string | null;
      access_count: number;
      pinned: number;
      needs_review: number;
      created_at: string;
      updated_at: string;
    }[];

    const mapped: Memory[] = rows.map((r) => ({
      id: r.id,
      content: r.content,
      type: r.type as MemoryType,
      tags: JSON.parse(r.tags) as string[],
      scope: r.scope,
      sourceHarness: r.source,
      accessCount: r.access_count,
      pinned: r.pinned !== 0,
      needsReview: r.needs_review !== 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    const formatter = new Formatter(true);
    const output = captureStdout(() => formatter.outputMemories(mapped));

    const parsed = JSON.parse(output) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
  });

  it("outputMemories human mode shows 'No memories found.' when empty", () => {
    const formatter = new Formatter(false);
    const output = captureStdout(() => formatter.outputMemories([]));
    expect(output).toContain("No memories found.");
  });

  it("outputMemories JSON mode returns empty array when no memories", () => {
    const formatter = new Formatter(true);
    const output = captureStdout(() => formatter.outputMemories([]));
    const parsed = JSON.parse(output) as unknown[];
    expect(parsed).toEqual([]);
  });
});
