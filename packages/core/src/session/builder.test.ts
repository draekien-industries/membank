import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../db/manager.js";
import { listMemoryTypes, SessionContextBuilder } from "./builder.js";

function insertMemory(
  db: DatabaseManager,
  opts: {
    id?: string;
    content?: string;
    type?: string;
    tags?: string[];
    scope?: string;
    source?: string | null;
    pinned?: boolean;
    needsReview?: boolean;
  }
): string {
  const id = opts.id ?? randomUUID();
  const now = new Date().toISOString();
  db.db
    .prepare(
      `INSERT INTO memories (id, content, type, tags, scope, source, access_count, pinned, needs_review, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
    )
    .run(
      id,
      opts.content ?? "test content",
      opts.type ?? "fact",
      JSON.stringify(opts.tags ?? []),
      opts.scope ?? "global",
      opts.source ?? null,
      opts.pinned ? 1 : 0,
      opts.needsReview ? 1 : 0,
      now,
      now
    );
  return id;
}

describe("listMemoryTypes()", () => {
  it("returns exactly the 5 types in priority order", () => {
    expect(listMemoryTypes()).toEqual(["correction", "preference", "decision", "learning", "fact"]);
  });
});

describe("SessionContextBuilder", () => {
  let db: DatabaseManager;
  let builder: SessionContextBuilder;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    builder = new SessionContextBuilder(db);
  });

  it("returns pinned global memories", () => {
    insertMemory(db, { scope: "global", pinned: true, content: "global pinned" });
    const ctx = builder.getSessionContext("project-x");
    expect(ctx.pinnedGlobal).toHaveLength(1);
    expect(ctx.pinnedGlobal[0]?.content).toBe("global pinned");
  });

  it("does NOT return unpinned global memories in pinnedGlobal", () => {
    insertMemory(db, { scope: "global", pinned: false, content: "unpinned global" });
    const ctx = builder.getSessionContext("project-x");
    expect(ctx.pinnedGlobal).toHaveLength(0);
  });

  it("returns pinned project memories for the given scope", () => {
    insertMemory(db, { scope: "project-a", pinned: true, content: "project-a pinned" });
    const ctx = builder.getSessionContext("project-a");
    expect(ctx.pinnedProject).toHaveLength(1);
    expect(ctx.pinnedProject[0]?.content).toBe("project-a pinned");
  });

  it("does NOT return pinned memories from a different project scope", () => {
    insertMemory(db, { scope: "project-b", pinned: true, content: "project-b pinned" });
    const ctx = builder.getSessionContext("project-a");
    expect(ctx.pinnedProject).toHaveLength(0);
  });

  it("stats contains correct counts per type including 0 for missing types", () => {
    insertMemory(db, { type: "correction" });
    insertMemory(db, { type: "correction" });
    insertMemory(db, { type: "preference" });
    const ctx = builder.getSessionContext("project-x");
    expect(ctx.stats.correction).toBe(2);
    expect(ctx.stats.preference).toBe(1);
    expect(ctx.stats.decision).toBe(0);
    expect(ctx.stats.learning).toBe(0);
    expect(ctx.stats.fact).toBe(0);
  });

  it("stats keys cover all 5 MemoryType values", () => {
    const ctx = builder.getSessionContext("project-x");
    const keys = Object.keys(ctx.stats).sort();
    expect(keys).toEqual(["correction", "decision", "fact", "learning", "preference"]);
  });

  it("pinnedGlobal memories have correct shape (tags as array, booleans, camelCase)", () => {
    insertMemory(db, {
      scope: "global",
      pinned: true,
      content: "shaped memory",
      type: "preference",
      tags: ["a", "b"],
      source: "claude",
    });
    const ctx = builder.getSessionContext("project-x");
    const mem = ctx.pinnedGlobal[0];
    expect(mem).toBeDefined();
    if (!mem) return;
    expect(Array.isArray(mem.tags)).toBe(true);
    expect(mem.tags).toEqual(["a", "b"]);
    expect(typeof mem.pinned).toBe("boolean");
    expect(mem.pinned).toBe(true);
    expect(typeof mem.needsReview).toBe("boolean");
    expect(typeof mem.accessCount).toBe("number");
    expect(mem.sourceHarness).toBe("claude");
    expect(mem.createdAt).toBeTruthy();
    expect(mem.updatedAt).toBeTruthy();
  });
});
