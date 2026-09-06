import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../../db/manager.js";
import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import { SqliteProjectRepository } from "../../project/infrastructure/sqlite-project-repository.js";
import { unitEmbedding } from "../../test-support/index.js";
import type { MemoryExportRecord } from "../ports.js";
import { SqliteMemoryRepository } from "./sqlite-memory-repository.js";

const MAX_VERSIONS = 10;

function makeRepo(): { db: DatabaseManager; repo: SqliteMemoryRepository } {
  const db = DatabaseManager.openInMemory();
  const projects = new SqliteProjectRepository(db);
  return { db, repo: new SqliteMemoryRepository(db, projects) };
}

function createMemory(
  repo: SqliteMemoryRepository,
  opts: { id: string; content?: string; embedding?: Float32Array; tags?: string[] }
): void {
  repo.create({
    id: opts.id,
    content: opts.content ?? "content",
    type: "preference",
    tags: opts.tags ?? [],
    sourceHarness: null,
    embedding: opts.embedding ?? unitEmbedding(0),
    projectScope: { hash: GLOBAL_SCOPE_HASH, name: "global" },
  });
}

describe("SqliteMemoryRepository — exportAll", () => {
  let db: DatabaseManager;
  let repo: SqliteMemoryRepository;

  beforeEach(() => {
    ({ db, repo } = makeRepo());
  });

  it("returns an empty array when no memories exist", () => {
    expect(repo.exportAll()).toEqual([]);
  });

  it("maps a stored row onto the MemoryExportRecord contract", () => {
    createMemory(repo, { id: "m1", content: "use tabs", tags: ["style", "editor"] });

    const [record] = repo.exportAll();

    expect(record).toMatchObject({
      id: "m1",
      content: "use tabs",
      type: "preference",
      tags: ["style", "editor"],
      sourceHarness: null,
      accessCount: 0,
      pinned: false,
    });
  });

  it("reports pinned as a boolean rather than the stored integer", () => {
    createMemory(repo, { id: "m1" });
    repo.setPin("m1", true);

    expect(repo.exportAll()[0]?.pinned).toBe(true);
  });

  it("returns the embedding as a Float32Array of the stored dimension", () => {
    createMemory(repo, { id: "m1", embedding: unitEmbedding(0) });

    const embedding = repo.exportAll()[0]?.embedding;

    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding?.length).toBe(384);
  });

  it("preserves every component of the stored vector", () => {
    // A vector whose values are all distinct, so a byte-offset or stride error
    // in the blob decode cannot coincidentally produce the same array.
    const original = new Float32Array(384);
    for (let i = 0; i < original.length; i++) {
      original[i] = (i + 1) / 1000;
    }
    createMemory(repo, { id: "m1", embedding: original });

    expect(Array.from(repo.exportAll()[0]?.embedding ?? [])).toEqual(Array.from(original));
  });

  it("returns a null embedding for a memory with no embedding row", () => {
    createMemory(repo, { id: "m1" });
    db.mutate(
      "DELETE FROM embeddings WHERE rowid = (SELECT rowid FROM memories WHERE id = ?)",
      "m1"
    );

    expect(repo.exportAll()[0]?.embedding).toBeNull();
  });
});

describe("SqliteMemoryRepository — importAll", () => {
  let repo: SqliteMemoryRepository;

  beforeEach(() => {
    ({ repo } = makeRepo());
  });

  it("accepts an empty record list without writing anything", () => {
    repo.importAll([]);
    expect(repo.exportAll()).toEqual([]);
  });

  it("round-trips every exported record into a separate database", () => {
    createMemory(repo, { id: "m1", content: "use tabs", tags: ["style"] });
    createMemory(repo, { id: "m2", content: "prefer pnpm" });
    const exported = repo.exportAll();

    const { repo: fresh } = makeRepo();
    fresh.importAll(exported);

    expect(fresh.exportAll()).toEqual(exported);
  });

  it("preserves the embedding vector across the round trip", () => {
    const original = new Float32Array(384);
    for (let i = 0; i < original.length; i++) {
      original[i] = (i + 1) / 1000;
    }
    createMemory(repo, { id: "m1", embedding: original });

    const { repo: fresh } = makeRepo();
    fresh.importAll(repo.exportAll());

    expect(Array.from(fresh.exportAll()[0]?.embedding ?? [])).toEqual(Array.from(original));
  });

  it("carries a null embedding through without inventing a vector", () => {
    const record: MemoryExportRecord = {
      id: "m1",
      content: "no embedding",
      type: "fact",
      tags: [],
      sourceHarness: null,
      accessCount: 0,
      pinned: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      embedding: null,
    };

    repo.importAll([record]);

    expect(repo.exportAll()[0]?.embedding).toBeNull();
  });

  it("replaces an existing memory that shares the imported id", () => {
    createMemory(repo, { id: "m1", content: "original" });
    const [existing] = repo.exportAll();
    if (existing === undefined) throw new Error("expected a memory to export");

    repo.importAll([{ ...existing, content: "replaced" }]);

    const all = repo.exportAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.content).toBe("replaced");
  });
});

describe("SqliteMemoryRepository — findManyById", () => {
  let repo: SqliteMemoryRepository;

  beforeEach(() => {
    ({ repo } = makeRepo());
  });

  it("returns an empty array for an empty id list", () => {
    createMemory(repo, { id: "m1" });
    expect(repo.findManyById([])).toEqual([]);
  });

  it("omits ids that do not exist rather than returning a gap", () => {
    createMemory(repo, { id: "m1" });

    const found = repo.findManyById(["m1", "does-not-exist"]);

    expect(found.map((m) => m.id)).toEqual(["m1"]);
  });

  it("returns every requested memory that exists", () => {
    createMemory(repo, { id: "m1" });
    createMemory(repo, { id: "m2" });
    createMemory(repo, { id: "m3" });

    const found = repo.findManyById(["m1", "m3"]);

    expect(found.map((m) => m.id).sort()).toEqual(["m1", "m3"]);
  });
});

describe("SqliteMemoryRepository — version history", () => {
  let repo: SqliteMemoryRepository;

  beforeEach(() => {
    ({ repo } = makeRepo());
  });

  it("records no versions for a memory that was never overwritten", () => {
    createMemory(repo, { id: "m1", content: "v1" });
    expect(repo.listVersions("m1")).toEqual([]);
  });

  it("archives the previous content when a memory is overwritten", () => {
    createMemory(repo, { id: "m1", content: "v1" });

    repo.overwrite("m1", "v2", unitEmbedding(1));

    const versions = repo.listVersions("m1");
    expect(versions).toHaveLength(1);
    expect(versions[0]?.content).toBe("v1");
    expect(versions[0]?.version).toBe(1);
  });

  it("orders versions newest first", () => {
    createMemory(repo, { id: "m1", content: "v1" });
    repo.overwrite("m1", "v2", unitEmbedding(1));
    repo.overwrite("m1", "v3", unitEmbedding(2));

    expect(repo.listVersions("m1").map((v) => v.version)).toEqual([2, 1]);
    expect(repo.listVersions("m1").map((v) => v.content)).toEqual(["v2", "v1"]);
  });

  it("returns the archived content for a known version", () => {
    createMemory(repo, { id: "m1", content: "v1" });
    repo.overwrite("m1", "v2", unitEmbedding(1));

    expect(repo.getVersion("m1", 1)?.content).toBe("v1");
  });

  it("returns undefined for a version that was never written", () => {
    createMemory(repo, { id: "m1", content: "v1" });
    expect(repo.getVersion("m1", 99)).toBeUndefined();
  });

  it("returns undefined for a memory that does not exist", () => {
    expect(repo.getVersion("nope", 1)).toBeUndefined();
  });

  it(`retains at most ${MAX_VERSIONS} versions, dropping the oldest`, () => {
    createMemory(repo, { id: "m1", content: "v1" });
    // MAX_VERSIONS + 2 overwrites archive MAX_VERSIONS + 2 prior contents,
    // so the two oldest must have been pruned.
    for (let i = 2; i <= MAX_VERSIONS + 3; i++) {
      repo.overwrite("m1", `v${i}`, unitEmbedding(i % 384));
    }

    const versions = repo.listVersions("m1");

    expect(versions.length).toBeLessThanOrEqual(MAX_VERSIONS);
    expect(versions.map((v) => v.content)).not.toContain("v1");
    expect(versions[0]?.content).toBe(`v${MAX_VERSIONS + 2}`);
  });
});
