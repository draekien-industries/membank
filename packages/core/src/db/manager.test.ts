import { describe, expect, it } from "vitest";
import { DatabaseError } from "./errors.js";
import { DatabaseManager } from "./manager.js";

describe("DatabaseManager", () => {
  describe("schema init", () => {
    it("creates all required tables on first open", () => {
      const mgr = DatabaseManager.openInMemory();

      const tables = mgr.db
        .prepare<[], { name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        )
        .all()
        .map((r) => r.name);

      expect(tables).toContain("memories");
      expect(tables).toContain("meta");
      expect(tables).toContain("projects");
      expect(tables).toContain("memory_projects");
      expect(tables).toContain("memory_review_events");

      // embeddings is a virtual table; its shadow tables are visible in sqlite_master
      const allNames = mgr.db
        .prepare<[], { name: string }>("SELECT name FROM sqlite_master ORDER BY name")
        .all()
        .map((r) => r.name);

      expect(allNames.some((n) => n === "embeddings" || n.startsWith("embeddings_"))).toBe(true);

      mgr.close();
    });

    it("memories table has the correct columns (no scope after migration 2, no needs_review after migration 3)", () => {
      const mgr = DatabaseManager.openInMemory();

      const cols = mgr.db
        .prepare<[], { name: string }>("PRAGMA table_info(memories)")
        .all()
        .map((r) => r.name);

      for (const col of [
        "id",
        "content",
        "type",
        "tags",
        "source",
        "access_count",
        "pinned",
        "created_at",
        "updated_at",
      ]) {
        expect(cols).toContain(col);
      }

      expect(cols).not.toContain("scope");
      expect(cols).not.toContain("needs_review");

      mgr.close();
    });

    it("projects table has the correct columns", () => {
      const mgr = DatabaseManager.openInMemory();

      const cols = mgr.db
        .prepare<[], { name: string }>("PRAGMA table_info(projects)")
        .all()
        .map((r) => r.name);

      for (const col of ["id", "name", "scope_hash", "created_at", "updated_at"]) {
        expect(cols).toContain(col);
      }

      mgr.close();
    });

    it("memory_projects table has the correct columns", () => {
      const mgr = DatabaseManager.openInMemory();

      const cols = mgr.db
        .prepare<[], { name: string }>("PRAGMA table_info(memory_projects)")
        .all()
        .map((r) => r.name);

      expect(cols).toContain("memory_id");
      expect(cols).toContain("project_id");

      mgr.close();
    });
  });

  describe("migrations", () => {
    it("schema_version in meta is 3 after full init", () => {
      const mgr = DatabaseManager.openInMemory();

      const row = mgr.db
        .prepare<[], { value: string }>("SELECT value FROM meta WHERE key = 'schema_version'")
        .get();

      expect(row).not.toBeUndefined();
      expect(row?.value).toBe("3");

      mgr.close();
    });
  });

  describe("idempotency", () => {
    it("calling openInMemory twice produces independent databases without error", () => {
      const mgr1 = DatabaseManager.openInMemory();
      const mgr2 = DatabaseManager.openInMemory();

      const v1 = mgr1.db
        .prepare<[], { value: string }>("SELECT value FROM meta WHERE key = 'schema_version'")
        .get();
      const v2 = mgr2.db
        .prepare<[], { value: string }>("SELECT value FROM meta WHERE key = 'schema_version'")
        .get();

      expect(v1?.value).toBe("3");
      expect(v2?.value).toBe("3");

      mgr1.close();
      mgr2.close();
    });
  });

  describe("error handling", () => {
    it("throws DatabaseError when the vec loader throws", () => {
      const badLoader = () => {
        throw new Error("extension load failed");
      };

      expect(() => DatabaseManager._openInMemoryWithLoader(badLoader)).toThrow(DatabaseError);
    });
  });

  describe("close()", () => {
    it("closes the underlying connection", () => {
      const mgr = DatabaseManager.openInMemory();
      mgr.close();

      expect(() => mgr.db.prepare("SELECT 1").run()).toThrow();
    });
  });
});
