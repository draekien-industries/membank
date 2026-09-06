import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseManager } from "../../db/manager.js";
import { SqliteMemoryRepository } from "../../memory/infrastructure/sqlite-memory-repository.js";
import {
  openTempDatabase,
  seedActivityEvent,
  seedSynthesis,
  seedSynthesisVersion,
  type TempDatabase,
} from "../../test-support/index.js";
import { GLOBAL_PROJECT_ID } from "../domain/global-scope.js";
import { SqliteProjectRepository } from "./sqlite-project-repository.js";

const HASH_A = "aaaaaaaaaaaaaaaa";
const HASH_B = "bbbbbbbbbbbbbbbb";

function makeEmbedding(dimension: number): Float32Array {
  const arr = new Float32Array(384).fill(0);
  arr[dimension] = 1;
  return arr;
}

describe("SqliteProjectRepository — file-based DB", () => {
  let temp: TempDatabase;
  let db: DatabaseManager;
  let projects: SqliteProjectRepository;
  let memories: SqliteMemoryRepository;

  beforeEach(() => {
    temp = openTempDatabase();
    db = temp.db;
    projects = new SqliteProjectRepository(db);
    memories = new SqliteMemoryRepository(db, projects);
  });

  afterEach(() => {
    temp.cleanup();
  });

  function createMemory(hash: string): string {
    const id = randomUUID();
    memories.create({
      id,
      content: `memory ${id}`,
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
      projectScope: { hash, name: `proj-${hash.slice(0, 4)}` },
    });
    return id;
  }

  function countWhere(sql: string, ...params: string[]): number {
    const row = db.one<{ count: number }>(sql, ...params);
    return row?.count ?? 0;
  }

  describe("merge", () => {
    it("moves associations, re-keys activity, cascades synthesis, keeps memories", () => {
      const source = projects.upsertByHash(HASH_A, "orphan");
      const target = projects.upsertByHash(HASH_B, "parent");
      const exclusive = createMemory(HASH_A);
      const shared = createMemory(HASH_A);
      projects.addAssociation(shared, target.id);

      seedActivityEvent(db, {
        projectHash: HASH_A,
        eventType: "memory_saved",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      seedSynthesis(db, {
        scope: HASH_A,
        content: "summary",
        sourceMemoryHash: "h",
        synthesizedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-12-31T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      seedSynthesisVersion(db, {
        scope: HASH_A,
        version: 1,
        content: "summary v1",
        sourceMemoryHash: "h",
        synthesizedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      const result = projects.merge(source.id, target.id);

      expect(result.movedMemories).toBe(2);
      expect(
        countWhere(`SELECT COUNT(*) AS count FROM memory_projects WHERE project_id = ?`, target.id)
      ).toBe(2);
      expect(
        countWhere(`SELECT COUNT(*) AS count FROM activity_events WHERE project_hash = ?`, HASH_A)
      ).toBe(0);
      expect(
        countWhere(`SELECT COUNT(*) AS count FROM activity_events WHERE project_hash = ?`, HASH_B)
      ).toBe(1);
      expect(countWhere(`SELECT COUNT(*) AS count FROM syntheses WHERE scope = ?`, HASH_A)).toBe(0);
      expect(
        countWhere(`SELECT COUNT(*) AS count FROM synthesis_versions WHERE scope = ?`, HASH_A)
      ).toBe(0);
      expect(
        countWhere(`SELECT COUNT(*) AS count FROM memories WHERE id IN (?, ?)`, exclusive, shared)
      ).toBe(2);
      expect(projects.getById(source.id)).toBeUndefined();
    });

    it("rejects merging a project into itself", () => {
      const p = projects.upsertByHash(HASH_A, "orphan");
      expect(() => projects.merge(p.id, p.id)).toThrow("Cannot merge a project into itself");
    });
  });

  describe("listExclusiveMemoryIds + deleteById", () => {
    it("lists only memories unique to the project and cascades on delete", () => {
      const doomed = projects.upsertByHash(HASH_A, "orphan");
      const keeper = projects.upsertByHash(HASH_B, "parent");
      const exclusive = createMemory(HASH_A);
      const shared = createMemory(HASH_A);
      projects.addAssociation(shared, keeper.id);

      expect(projects.listExclusiveMemoryIds(doomed.id)).toEqual([exclusive]);

      const rowidRow = db.one<{ rowid: number }>(
        `SELECT rowid FROM memories WHERE id = ?`,
        exclusive
      );
      const exclusiveRowid = rowidRow?.rowid ?? -1;

      memories.delete(exclusive);
      projects.deleteById(doomed.id);

      expect(projects.getById(doomed.id)).toBeUndefined();
      expect(projects.getById(keeper.id)).toBeDefined();
      expect(countWhere(`SELECT COUNT(*) AS count FROM memories WHERE id = ?`, exclusive)).toBe(0);
      expect(countWhere(`SELECT COUNT(*) AS count FROM memories WHERE id = ?`, shared)).toBe(1);
      expect(
        db.one<{ count: number }>(
          `SELECT COUNT(*) AS count FROM embeddings WHERE rowid = ?`,
          exclusiveRowid
        )?.count
      ).toBe(0);
    });

    it("refuses to delete the global project", () => {
      expect(() => projects.deleteById(GLOBAL_PROJECT_ID)).toThrow(
        "Cannot delete the global project"
      );
    });
  });

  describe("upsertByHash", () => {
    it("backfills a null origin without overwriting an existing one", () => {
      projects.upsertByHash(HASH_A, "orphan");
      const backfilled = projects.upsertByHash(HASH_A, "orphan", "/repos/main");
      expect(backfilled.origin).toBe("/repos/main");

      const unchanged = projects.upsertByHash(HASH_A, "orphan", "/other/path");
      expect(unchanged.origin).toBe("/repos/main");
    });
  });
});
