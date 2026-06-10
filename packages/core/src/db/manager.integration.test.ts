import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "./manager.js";

const runIntegration = process.env.MEMBANK_INTEGRATION === "true";
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../test-fixtures");

// Returns a raw file-based DB at schema v4 (pre-migration-5 state) with a projects table
// that has no CHECK constraint, allowing corrupt scope_hash values to be inserted.
function setupV4Db(dbPath: string): BetterSqlite3.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new BetterSqlite3(dbPath);
  sqliteVec.load(db);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.prepare("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)").run();
  db.prepare(`
    CREATE TABLE memories (
      id           TEXT PRIMARY KEY,
      content      TEXT NOT NULL,
      type         TEXT NOT NULL,
      tags         TEXT NOT NULL DEFAULT '[]',
      source       TEXT,
      access_count INTEGER NOT NULL DEFAULT 0,
      pinned       INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    )
  `).run();
  db.prepare("CREATE VIRTUAL TABLE embeddings USING vec0(embedding FLOAT[384])").run();
  db.prepare(`
    CREATE TABLE projects (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      scope_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  db.prepare(`
    CREATE TABLE memory_projects (
      memory_id  TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      PRIMARY KEY (memory_id, project_id)
    )
  `).run();
  db.prepare(`
    CREATE TABLE memory_review_events (
      id                        TEXT PRIMARY KEY,
      memory_id                 TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      conflicting_memory_id     TEXT REFERENCES memories(id) ON DELETE SET NULL,
      similarity                REAL NOT NULL,
      conflict_content_snapshot TEXT NOT NULL,
      reason                    TEXT NOT NULL,
      created_at                TEXT NOT NULL,
      resolved_at               TEXT
    )
  `).run();
  db.prepare(`
    CREATE TABLE syntheses (
      id                 TEXT PRIMARY KEY,
      scope              TEXT NOT NULL,
      content            TEXT NOT NULL,
      source_memory_hash TEXT NOT NULL,
      synthesized_at     TEXT NOT NULL,
      expires_at         TEXT NOT NULL,
      in_flight_since    TEXT,
      created_at         TEXT NOT NULL,
      updated_at         TEXT NOT NULL,
      UNIQUE(scope),
      CHECK(expires_at > synthesized_at)
    )
  `).run();
  db.prepare("INSERT INTO meta VALUES ('schema_version', '4')").run();
  return db;
}

describe.skipIf(!runIntegration)("DatabaseManager — integration (file-based DB)", () => {
  let dbPath: string;
  let manager: DatabaseManager | undefined;

  beforeEach(() => {
    mkdirSync(fixturesDir, { recursive: true });
    dbPath = join(fixturesDir, `${randomUUID()}.db`);
  });

  afterEach(() => {
    manager?.close();
    manager = undefined;
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(dbPath + suffix, { force: true });
    }
  });

  it("applies all migrations and sets schema_version to 14 on a fresh file DB", () => {
    manager = DatabaseManager.open(dbPath);
    const row = manager.db
      .prepare<[], { value: string }>("SELECT value FROM meta WHERE key = 'schema_version'")
      .get();
    expect(row?.value).toBe("14");
  });

  it("data persists across close and reopen", () => {
    manager = DatabaseManager.open(dbPath);
    const now = new Date().toISOString();
    manager.db
      .prepare(
        "INSERT INTO projects (id, name, scope_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run("pid-1", "my-project", "abcdef0123456789", now, now);
    manager.close();
    manager = undefined;

    manager = DatabaseManager.open(dbPath);
    const row = manager.db
      .prepare<[string], { name: string }>("SELECT name FROM projects WHERE scope_hash = ?")
      .get("abcdef0123456789");
    expect(row?.name).toBe("my-project");
  });

  it("scope_hash CHECK constraint is enforced on a file DB", () => {
    manager = DatabaseManager.open(dbPath);
    const db = manager.db;
    const now = new Date().toISOString();
    expect(() =>
      db
        .prepare(
          "INSERT INTO projects (id, name, scope_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
        )
        .run("pid-bad", "test", "not-a-valid-hash", now, now)
    ).toThrow();
  });

  it("migration v5: memories linked to a corrupt project are reassociated with the valid counterpart", () => {
    const db = setupV4Db(dbPath);
    const now = new Date().toISOString();

    // Valid project with correct 16-char hex hash
    db.prepare(
      "INSERT INTO projects (id, name, scope_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run("valid-pid", "athena", "21245954f2e86808", now, now);

    // Corrupt project: same name, scope_hash is the plain project name
    db.prepare(
      "INSERT INTO projects (id, name, scope_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run("corrupt-pid", "athena", "athena", now, now);

    db.prepare(
      "INSERT INTO memories (id, content, type, tags, access_count, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("mem-1", "athena project memory", "fact", "[]", 0, 0, now, now);

    db.prepare("INSERT INTO memory_projects (memory_id, project_id) VALUES (?, ?)").run(
      "mem-1",
      "corrupt-pid"
    );

    db.close();

    manager = DatabaseManager.open(dbPath);

    // Corrupt project must be gone
    const corruptProject = manager.db
      .prepare<[string], { id: string }>("SELECT id FROM projects WHERE scope_hash = ?")
      .get("athena");
    expect(corruptProject).toBeUndefined();

    // Memory must be re-linked to the valid project
    const assoc = manager.db
      .prepare<[string], { project_id: string }>(
        "SELECT project_id FROM memory_projects WHERE memory_id = ?"
      )
      .get("mem-1");
    expect(assoc?.project_id).toBe("valid-pid");
  });

  it("migration v5: memories from corrupt project with no valid counterpart become global (reassigned to sentinel by v7)", () => {
    const db = setupV4Db(dbPath);
    const now = new Date().toISOString();

    // Only the corrupt project exists — no valid counterpart
    db.prepare(
      "INSERT INTO projects (id, name, scope_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run("corrupt-pid", "parasol", "parasol", now, now);

    db.prepare(
      "INSERT INTO memories (id, content, type, tags, access_count, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("mem-1", "parasol project memory", "fact", "[]", 0, 0, now, now);

    db.prepare("INSERT INTO memory_projects (memory_id, project_id) VALUES (?, ?)").run(
      "mem-1",
      "corrupt-pid"
    );

    db.close();

    manager = DatabaseManager.open(dbPath);

    // Corrupt project must be gone
    const corruptProject = manager.db
      .prepare<[string], { id: string }>("SELECT id FROM projects WHERE scope_hash = ?")
      .get("parasol");
    expect(corruptProject).toBeUndefined();

    // Migration 7 reassigns orphaned memory to the sentinel global project
    const assoc = manager.db
      .prepare<[string], { project_id: string }>(
        "SELECT project_id FROM memory_projects WHERE memory_id = ?"
      )
      .get("mem-1");
    expect(assoc?.project_id).toBe("00000000-0000-0000-0000-000000000000");

    // Memory record itself must still exist
    const memory = manager.db
      .prepare<[string], { id: string }>("SELECT id FROM memories WHERE id = ?")
      .get("mem-1");
    expect(memory?.id).toBe("mem-1");
  });

  it("migration v7: orphaned memories (no memory_projects row) are associated with the sentinel global project", () => {
    const db = setupV4Db(dbPath);
    const now = new Date().toISOString();

    // Insert a real project and a memory scoped to it
    db.prepare(
      "INSERT INTO projects (id, name, scope_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run("real-pid", "my-project", "abcdef0123456789", now, now);
    db.prepare(
      "INSERT INTO memories (id, content, type, tags, access_count, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("project-mem", "project scoped memory", "fact", "[]", 0, 0, now, now);
    db.prepare("INSERT INTO memory_projects (memory_id, project_id) VALUES (?, ?)").run(
      "project-mem",
      "real-pid"
    );

    // Insert a global memory (no junction row)
    db.prepare(
      "INSERT INTO memories (id, content, type, tags, access_count, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("global-mem", "global memory", "preference", "[]", 0, 0, now, now);

    db.close();

    manager = DatabaseManager.open(dbPath);

    // Project memory must still point to the real project
    const projectAssoc = manager.db
      .prepare<[string], { project_id: string }>(
        "SELECT project_id FROM memory_projects WHERE memory_id = ?"
      )
      .get("project-mem");
    expect(projectAssoc?.project_id).toBe("real-pid");

    // Global memory must now point to the sentinel
    const globalAssoc = manager.db
      .prepare<[string], { project_id: string }>(
        "SELECT project_id FROM memory_projects WHERE memory_id = ?"
      )
      .get("global-mem");
    expect(globalAssoc?.project_id).toBe("00000000-0000-0000-0000-000000000000");

    // Sentinel project row must exist with the reserved scope_hash
    const sentinel = manager.db
      .prepare<[string], { scope_hash: string; name: string }>(
        "SELECT scope_hash, name FROM projects WHERE id = ?"
      )
      .get("00000000-0000-0000-0000-000000000000");
    expect(sentinel?.scope_hash).toBe("0000000000000000");
    expect(sentinel?.name).toBe("global");
  });

  it("migration v8: syntheses with scope='global' are rewritten to the sentinel hash", () => {
    const db = setupV4Db(dbPath);
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

    // Insert a pre-migration synthesis using the old "global" string
    db.prepare(
      `INSERT INTO syntheses (id, scope, content, source_memory_hash, synthesized_at, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("s1", "global", "old content", "hash1", now, future, now, now);

    db.prepare("UPDATE meta SET value = '7' WHERE key = 'schema_version'").run();
    db.close();

    manager = DatabaseManager.open(dbPath);

    const row = manager.db
      .prepare<[], { scope: string }>("SELECT scope FROM syntheses LIMIT 1")
      .get();
    expect(row?.scope).toBe("0000000000000000");
  });

  it("migration v8: syntheses FK rejects rows with unknown scope_hash", () => {
    manager = DatabaseManager.open(dbPath);
    const db = manager.db;
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

    expect(() =>
      db
        .prepare(
          `INSERT INTO syntheses (id, scope, content, source_memory_hash, synthesized_at, expires_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run("bad", "deadbeefdeadbeef", "content", "hash", now, future, now, now)
    ).toThrow();
  });
});
