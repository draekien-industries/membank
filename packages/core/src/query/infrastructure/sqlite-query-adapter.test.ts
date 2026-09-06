import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../../db/manager.js";
import { GLOBAL_PROJECT_ID } from "../../project/domain/global-scope.js";
import {
  linkMemoryToCapability,
  seedCapability,
  seedMemory,
  seedProject,
  unitEmbedding,
} from "../../test-support/index.js";
import { SqliteQueryAdapter } from "./sqlite-query-adapter.js";

const PROJECT_HASH = "1111111111111111";
const OTHER_HASH = "2222222222222222";

describe("SqliteQueryAdapter — findByEmbedding", () => {
  let db: DatabaseManager;
  let adapter: SqliteQueryAdapter;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    adapter = new SqliteQueryAdapter(db);
  });

  function ids(results: Array<{ id: string }>): string[] {
    return results.map((r) => r.id).sort();
  }

  it("returns nothing when the store is empty", () => {
    expect(adapter.findByEmbedding(unitEmbedding(0), {})).toEqual([]);
  });

  it("scores an identical vector as fully similar", () => {
    seedMemory(db, { id: "m1", embedding: unitEmbedding(0) });

    const [result] = adapter.findByEmbedding(unitEmbedding(0), {});

    expect(result?.cosineSim).toBeCloseTo(1, 5);
  });

  it("scores an orthogonal vector as unrelated", () => {
    seedMemory(db, { id: "m1", embedding: unitEmbedding(0) });

    const [result] = adapter.findByEmbedding(unitEmbedding(1), {});

    expect(result?.cosineSim).toBeCloseTo(0, 5);
  });

  it("returns each match as a full Memory alongside its similarity", () => {
    seedMemory(db, {
      id: "m1",
      content: "use tabs",
      type: "preference",
      tags: ["style"],
      embedding: unitEmbedding(0),
    });

    const [result] = adapter.findByEmbedding(unitEmbedding(0), {});

    expect(result).toMatchObject({
      id: "m1",
      content: "use tabs",
      type: "preference",
      tags: ["style"],
    });
  });

  it("omits memories that have no embedding row", () => {
    seedMemory(db, { id: "with-vector", embedding: unitEmbedding(0) });
    seedMemory(db, { id: "without-vector" });

    expect(ids(adapter.findByEmbedding(unitEmbedding(0), {}))).toEqual(["with-vector"]);
  });

  describe("pinned memories", () => {
    beforeEach(() => {
      seedMemory(db, { id: "unpinned", embedding: unitEmbedding(0) });
      seedMemory(db, { id: "pinned", pinned: true, embedding: unitEmbedding(0) });
    });

    it("excludes pinned memories by default, since they are injected at session start", () => {
      expect(ids(adapter.findByEmbedding(unitEmbedding(0), {}))).toEqual(["unpinned"]);
    });

    it("includes them when includePinned is set", () => {
      expect(ids(adapter.findByEmbedding(unitEmbedding(0), { includePinned: true }))).toEqual([
        "pinned",
        "unpinned",
      ]);
    });
  });

  describe("type filter", () => {
    beforeEach(() => {
      seedMemory(db, { id: "pref", type: "preference", embedding: unitEmbedding(0) });
      seedMemory(db, { id: "fact", type: "fact", embedding: unitEmbedding(0) });
    });

    it("returns every type when no filter is given", () => {
      expect(ids(adapter.findByEmbedding(unitEmbedding(0), {}))).toEqual(["fact", "pref"]);
    });

    it("narrows to the requested type", () => {
      expect(ids(adapter.findByEmbedding(unitEmbedding(0), { type: "fact" }))).toEqual(["fact"]);
    });
  });

  describe("project filter", () => {
    beforeEach(() => {
      const project = seedProject(db, { name: "alpha", scopeHash: PROJECT_HASH });
      const other = seedProject(db, { name: "beta", scopeHash: OTHER_HASH });
      seedMemory(db, { id: "in-project", projectId: project, embedding: unitEmbedding(0) });
      seedMemory(db, { id: "in-other", projectId: other, embedding: unitEmbedding(0) });
      seedMemory(db, {
        id: "in-global",
        projectId: GLOBAL_PROJECT_ID,
        embedding: unitEmbedding(0),
      });
      seedMemory(db, { id: "unscoped", embedding: unitEmbedding(0) });
    });

    it("returns the project's memories together with global ones", () => {
      expect(ids(adapter.findByEmbedding(unitEmbedding(0), { projectHash: PROJECT_HASH }))).toEqual(
        ["in-global", "in-project"]
      );
    });

    it("returns only global memories for a project hash nothing is scoped to", () => {
      expect(
        ids(adapter.findByEmbedding(unitEmbedding(0), { projectHash: "9999999999999999" }))
      ).toEqual(["in-global"]);
    });

    it("returns unscoped memories only when no project filter is applied", () => {
      expect(ids(adapter.findByEmbedding(unitEmbedding(0), {}))).toContain("unscoped");
      expect(
        ids(adapter.findByEmbedding(unitEmbedding(0), { projectHash: PROJECT_HASH }))
      ).not.toContain("unscoped");
    });
  });

  describe("capability filter", () => {
    beforeEach(() => {
      const capability = seedCapability(db, { key: "Bash" });
      seedMemory(db, { id: "with-capability", embedding: unitEmbedding(0) });
      seedMemory(db, { id: "without-capability", embedding: unitEmbedding(0) });
      linkMemoryToCapability(db, "with-capability", capability);
    });

    it("narrows to memories linked to that capability", () => {
      expect(ids(adapter.findByEmbedding(unitEmbedding(0), { capabilityKey: "Bash" }))).toEqual([
        "with-capability",
      ]);
    });

    it("returns nothing for a capability key no memory is linked to", () => {
      expect(adapter.findByEmbedding(unitEmbedding(0), { capabilityKey: "Read" })).toEqual([]);
    });

    it("takes precedence over projectHash, which is the broader scope", () => {
      const project = seedProject(db, { name: "alpha", scopeHash: PROJECT_HASH });
      seedMemory(db, { id: "project-only", projectId: project, embedding: unitEmbedding(0) });

      const results = adapter.findByEmbedding(unitEmbedding(0), {
        capabilityKey: "Bash",
        projectHash: PROJECT_HASH,
      });

      expect(ids(results)).toEqual(["with-capability"]);
    });
  });
});

describe("SqliteQueryAdapter — incrementAccessCount", () => {
  let db: DatabaseManager;
  let adapter: SqliteQueryAdapter;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    adapter = new SqliteQueryAdapter(db);
  });

  function accessCountOf(id: string): number | undefined {
    return db.one<{ access_count: number }>("SELECT access_count FROM memories WHERE id = ?", id)
      ?.access_count;
  }

  it("raises the count by one", () => {
    seedMemory(db, { id: "m1", accessCount: 3 });

    adapter.incrementAccessCount("m1");

    expect(accessCountOf("m1")).toBe(4);
  });

  it("accumulates across repeated reads", () => {
    seedMemory(db, { id: "m1", accessCount: 0 });

    adapter.incrementAccessCount("m1");
    adapter.incrementAccessCount("m1");

    expect(accessCountOf("m1")).toBe(2);
  });

  it("leaves other memories untouched", () => {
    seedMemory(db, { id: "m1", accessCount: 0 });
    seedMemory(db, { id: "m2", accessCount: 0 });

    adapter.incrementAccessCount("m1");

    expect(accessCountOf("m2")).toBe(0);
  });

  it("is a no-op for an id that does not exist", () => {
    expect(() => adapter.incrementAccessCount("nope")).not.toThrow();
  });
});
