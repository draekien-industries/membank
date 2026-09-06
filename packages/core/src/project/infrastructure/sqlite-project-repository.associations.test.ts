import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../../db/manager.js";
import { SqliteMemoryRepository } from "../../memory/infrastructure/sqlite-memory-repository.js";
import { unitEmbedding } from "../../test-support/index.js";
import { SqliteProjectRepository } from "./sqlite-project-repository.js";

const HASH_A = "aaaaaaaaaaaaaaaa";
const HASH_B = "bbbbbbbbbbbbbbbb";

describe("SqliteProjectRepository — lookup and association", () => {
  let db: DatabaseManager;
  let projects: SqliteProjectRepository;
  let memories: SqliteMemoryRepository;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    projects = new SqliteProjectRepository(db);
    memories = new SqliteMemoryRepository(db, projects);
  });

  function createMemory(id: string, hash: string): string {
    memories.create({
      id,
      content: `memory ${id}`,
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: unitEmbedding(0),
      projectScope: { hash, name: `proj-${hash.slice(0, 4)}` },
    });
    return id;
  }

  describe("getByName", () => {
    it("returns the project registered under that name", () => {
      projects.upsertByHash(HASH_A, "alpha");

      expect(projects.getByName("alpha")?.scopeHash).toBe(HASH_A);
    });

    it("returns undefined for a name no project uses", () => {
      projects.upsertByHash(HASH_A, "alpha");

      expect(projects.getByName("beta")).toBeUndefined();
    });
  });

  describe("rename", () => {
    it("returns the project carrying the new name", () => {
      const project = projects.upsertByHash(HASH_A, "alpha");

      expect(projects.rename(project.id, "renamed").name).toBe("renamed");
    });

    it("persists the new name for later lookups", () => {
      const project = projects.upsertByHash(HASH_A, "alpha");

      projects.rename(project.id, "renamed");

      expect(projects.getById(project.id)?.name).toBe("renamed");
      expect(projects.getByName("renamed")).toBeDefined();
    });

    it("leaves the scope hash untouched, since identity is the hash not the name", () => {
      const project = projects.upsertByHash(HASH_A, "alpha");

      projects.rename(project.id, "renamed");

      expect(projects.getByHash(HASH_A)?.id).toBe(project.id);
    });
  });

  describe("countMemories", () => {
    it("counts zero for a project with no associations", () => {
      const project = projects.upsertByHash(HASH_A, "alpha");

      expect(projects.countMemories(project.id)).toBe(0);
    });

    it("counts each associated memory once", () => {
      const project = projects.upsertByHash(HASH_A, "alpha");
      createMemory("m1", HASH_A);
      createMemory("m2", HASH_A);

      expect(projects.countMemories(project.id)).toBe(2);
    });

    it("excludes memories belonging only to another project", () => {
      const alpha = projects.upsertByHash(HASH_A, "alpha");
      projects.upsertByHash(HASH_B, "beta");
      createMemory("m1", HASH_A);
      createMemory("m2", HASH_B);

      expect(projects.countMemories(alpha.id)).toBe(1);
    });
  });

  describe("removeAssociation", () => {
    it("drops the memory from the project's count", () => {
      const alpha = projects.upsertByHash(HASH_A, "alpha");
      createMemory("m1", HASH_A);

      projects.removeAssociation("m1", alpha.id);

      expect(projects.countMemories(alpha.id)).toBe(0);
    });

    it("keeps the memory itself, which may still belong elsewhere", () => {
      const alpha = projects.upsertByHash(HASH_A, "alpha");
      const beta = projects.upsertByHash(HASH_B, "beta");
      createMemory("m1", HASH_A);
      projects.addAssociation("m1", beta.id);

      projects.removeAssociation("m1", alpha.id);

      expect(memories.findById("m1")).toBeDefined();
      expect(projects.countMemories(beta.id)).toBe(1);
    });

    it("is a no-op for an association that was never made", () => {
      const alpha = projects.upsertByHash(HASH_A, "alpha");
      const beta = projects.upsertByHash(HASH_B, "beta");
      createMemory("m1", HASH_A);

      projects.removeAssociation("m1", beta.id);

      expect(projects.countMemories(alpha.id)).toBe(1);
    });
  });

  describe("getProjectsForMemories", () => {
    it("returns an empty map for an empty id list", () => {
      expect(projects.getProjectsForMemories([]).size).toBe(0);
    });

    it("keys the map by memory id", () => {
      projects.upsertByHash(HASH_A, "alpha");
      createMemory("m1", HASH_A);

      const map = projects.getProjectsForMemories(["m1"]);

      expect(map.get("m1")?.map((p) => p.scopeHash)).toEqual([HASH_A]);
    });

    it("lists every project a memory belongs to", () => {
      projects.upsertByHash(HASH_A, "alpha");
      const beta = projects.upsertByHash(HASH_B, "beta");
      createMemory("m1", HASH_A);
      projects.addAssociation("m1", beta.id);

      const hashes = projects
        .getProjectsForMemories(["m1"])
        .get("m1")
        ?.map((p) => p.scopeHash)
        .sort();

      expect(hashes).toEqual([HASH_A, HASH_B]);
    });

    it("omits ids with no project rather than mapping them to an empty list", () => {
      projects.upsertByHash(HASH_A, "alpha");
      createMemory("m1", HASH_A);

      const map = projects.getProjectsForMemories(["m1", "unknown"]);

      expect(map.has("unknown")).toBe(false);
    });
  });
});
