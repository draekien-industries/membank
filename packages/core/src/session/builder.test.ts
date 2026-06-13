import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../db/manager.js";
import { createMemoryRepository } from "../memory/infrastructure/sqlite-memory-repository.js";
import { createProjectRepository } from "../project/infrastructure/sqlite-project-repository.js";
import { listMemoryTypes, SessionContextBuilder } from "./builder.js";

const SENTINEL_PROJECT_ID = "00000000-0000-0000-0000-000000000000";

function insertMemory(
  db: DatabaseManager,
  opts: {
    id?: string;
    content?: string;
    type?: string;
    tags?: string[];
    source?: string | null;
    pinned?: boolean;
    projectId?: string; // defaults to sentinel (global)
  }
): string {
  const id = opts.id ?? randomUUID();
  const now = new Date().toISOString();
  db.db
    .prepare(
      `INSERT INTO memories (id, content, type, tags, source, access_count, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
    )
    .run(
      id,
      opts.content ?? "test content",
      opts.type ?? "fact",
      JSON.stringify(opts.tags ?? []),
      opts.source ?? null,
      opts.pinned ? 1 : 0,
      now,
      now
    );
  db.db
    .prepare(`INSERT INTO memory_projects (memory_id, project_id) VALUES (?, ?)`)
    .run(id, opts.projectId ?? SENTINEL_PROJECT_ID);
  return id;
}

function insertProject(db: DatabaseManager, scopeHash: string, name?: string): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.db
    .prepare(
      `INSERT INTO projects (id, name, scope_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, name ?? `project-${scopeHash.slice(0, 8)}`, scopeHash, now, now);
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
    const projects = createProjectRepository(db);
    const repo = createMemoryRepository(db, projects);
    builder = new SessionContextBuilder(repo);
  });

  it("returns pinned global memories", () => {
    insertMemory(db, { pinned: true, content: "global pinned" });
    const ctx = builder.getSessionContext("project-x");
    expect(ctx.pinnedGlobal).toHaveLength(1);
    expect(ctx.pinnedGlobal[0]?.content).toBe("global pinned");
  });

  it("does NOT return unpinned global memories in pinnedGlobal", () => {
    insertMemory(db, { pinned: false, content: "unpinned global" });
    const ctx = builder.getSessionContext("project-x");
    expect(ctx.pinnedGlobal).toHaveLength(0);
  });

  it("returns pinned project memories for the given scope", () => {
    const projId = insertProject(db, "aa00000000000000");
    insertMemory(db, { pinned: true, content: "project-a pinned", projectId: projId });
    const ctx = builder.getSessionContext("aa00000000000000");
    expect(ctx.pinnedProject).toHaveLength(1);
    expect(ctx.pinnedProject[0]?.content).toBe("project-a pinned");
  });

  it("does NOT return pinned memories from a different project scope", () => {
    const projId = insertProject(db, "bb00000000000000");
    insertMemory(db, { pinned: true, content: "project-b pinned", projectId: projId });
    const ctx = builder.getSessionContext("aa00000000000000");
    expect(ctx.pinnedProject).toHaveLength(0);
  });

  it("does NOT include project memories in pinnedGlobal", () => {
    const projId = insertProject(db, "cc00000000000000");
    insertMemory(db, { pinned: true, content: "project memory", projectId: projId });
    const ctx = builder.getSessionContext("dd00000000000000");
    expect(ctx.pinnedGlobal).toHaveLength(0);
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

  it("orders sections by MemoryType precedence (correction > preference > decision > learning > fact)", () => {
    const ctx = builder.getSessionContext("project-x", [
      { kind: "synthesis", memoryType: "fact", content: "f" },
      { kind: "synthesis", memoryType: "correction", content: "c" },
      { kind: "synthesis", memoryType: "learning", content: "l" },
      { kind: "synthesis", memoryType: "preference", content: "p" },
      { kind: "synthesis", memoryType: "decision", content: "d" },
    ]);
    expect(ctx.sections.map((s) => s.memoryType)).toEqual([
      "correction",
      "preference",
      "decision",
      "learning",
      "fact",
    ]);
  });

  it("keeps multiple sections of the same type in supplied order, sorted relative to other types", () => {
    const ctx = builder.getSessionContext("project-x", [
      { kind: "synthesis", memoryType: "decision", content: "decision summary" },
      { kind: "synthesis", memoryType: "preference", content: "pref summary" },
      {
        kind: "verbatim",
        memoryType: "preference",
        memories: ["pref verbatim"],
        synthesizable: true,
      },
    ]);
    expect(ctx.sections).toEqual([
      { kind: "synthesis", memoryType: "preference", content: "pref summary" },
      {
        kind: "verbatim",
        memoryType: "preference",
        memories: ["pref verbatim"],
        synthesizable: true,
      },
      { kind: "synthesis", memoryType: "decision", content: "decision summary" },
    ]);
  });

  it("emits a synthesis section only for non-empty content, skipping empty content", () => {
    const ctx = builder.getSessionContext("project-x", [
      { kind: "synthesis", memoryType: "correction", content: "real" },
      { kind: "synthesis", memoryType: "preference", content: "" },
    ]);
    expect(ctx.sections).toEqual([
      { kind: "synthesis", memoryType: "correction", content: "real" },
    ]);
  });

  it("emits a verbatim section carrying the supplied memories", () => {
    const ctx = builder.getSessionContext("project-x", [
      { kind: "verbatim", memoryType: "decision", memories: ["a", "b"], synthesizable: false },
    ]);
    expect(ctx.sections).toEqual([
      { kind: "verbatim", memoryType: "decision", memories: ["a", "b"], synthesizable: false },
    ]);
  });

  it("skips a verbatim section with no memories", () => {
    const ctx = builder.getSessionContext("project-x", [
      { kind: "verbatim", memoryType: "decision", memories: [], synthesizable: false },
    ]);
    expect(ctx.sections).toEqual([]);
  });

  it("returns no sections when none are supplied", () => {
    const ctx = builder.getSessionContext("project-x");
    expect(ctx.sections).toEqual([]);
  });

  it("assembles a SessionContext carrying pinned sections and ordered sections together", () => {
    const projId = insertProject(db, "ee00000000000000");
    insertMemory(db, { pinned: true, content: "global pin" });
    insertMemory(db, { pinned: true, content: "project pin", projectId: projId });

    const ctx = builder.getSessionContext("ee00000000000000", [
      { kind: "synthesis", memoryType: "decision", content: "decision summary" },
      {
        kind: "verbatim",
        memoryType: "correction",
        memories: ["small correction"],
        synthesizable: false,
      },
    ]);

    expect(ctx.pinnedGlobal.map((m) => m.content)).toEqual(["global pin"]);
    expect(ctx.pinnedProject.map((m) => m.content)).toEqual(["project pin"]);
    expect(ctx.sections).toEqual([
      {
        kind: "verbatim",
        memoryType: "correction",
        memories: ["small correction"],
        synthesizable: false,
      },
      { kind: "synthesis", memoryType: "decision", content: "decision summary" },
    ]);
    expect(Object.keys(ctx)).toEqual(
      expect.arrayContaining(["stats", "pinnedGlobal", "pinnedProject", "sections"])
    );
  });

  it("pinnedGlobal memories have correct shape (tags as array, booleans, camelCase)", () => {
    insertMemory(db, {
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
    expect(Array.isArray(mem.reviewEvents)).toBe(true);
    expect(typeof mem.accessCount).toBe("number");
    expect(mem.sourceHarness).toBe("claude");
    expect(mem.createdAt).toBeTruthy();
    expect(mem.updatedAt).toBeTruthy();
  });
});
