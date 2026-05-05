import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { DatabaseError } from "./errors.js";

const DEFAULT_DB_PATH = join(homedir(), ".membank", "memory.db");

type VecLoader = (db: BetterSqlite3.Database) => void;

const MIGRATIONS: [number, string][] = [
  [
    1,
    `
CREATE TABLE IF NOT EXISTS memories (
  id           TEXT PRIMARY KEY,
  content      TEXT NOT NULL,
  type         TEXT NOT NULL,
  tags         TEXT NOT NULL DEFAULT '[]',
  scope        TEXT NOT NULL,
  source       TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  pinned       INTEGER NOT NULL DEFAULT 0,
  needs_review INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
  embedding FLOAT[384]
);
`,
  ],
  [
    2,
    `
CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  scope_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_projects (
  memory_id  TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (memory_id, project_id)
);

INSERT OR IGNORE INTO projects (id, name, scope_hash, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))),
  'project-' || substr(scope, 1, 8),
  scope,
  datetime('now'),
  datetime('now')
FROM memories
WHERE scope != 'global'
GROUP BY scope;

INSERT OR IGNORE INTO memory_projects (memory_id, project_id)
SELECT m.id, p.id
FROM memories m
JOIN projects p ON p.scope_hash = m.scope
WHERE m.scope != 'global';

ALTER TABLE memories DROP COLUMN scope;
`,
  ],
  [
    3,
    `
CREATE TABLE IF NOT EXISTS memory_review_events (
  id                        TEXT PRIMARY KEY,
  memory_id                 TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  conflicting_memory_id     TEXT REFERENCES memories(id) ON DELETE SET NULL,
  similarity                REAL NOT NULL,
  conflict_content_snapshot TEXT NOT NULL,
  reason                    TEXT NOT NULL,
  created_at                TEXT NOT NULL,
  resolved_at               TEXT
);

CREATE INDEX IF NOT EXISTS idx_review_events_memory_open
  ON memory_review_events(memory_id) WHERE resolved_at IS NULL;

ALTER TABLE memories DROP COLUMN needs_review;
`,
  ],
];

export class DatabaseManager {
  readonly #db: BetterSqlite3.Database;

  private constructor(db: BetterSqlite3.Database) {
    this.#db = db;
  }

  static open(dbPath?: string): DatabaseManager {
    const resolvedPath = dbPath ?? DEFAULT_DB_PATH;
    mkdirSync(dirname(resolvedPath), { recursive: true });
    const db = new BetterSqlite3(resolvedPath);
    return DatabaseManager.#init(db, sqliteVec.load);
  }

  static openInMemory(): DatabaseManager {
    return DatabaseManager.#initInMemory(sqliteVec.load);
  }

  /** For testing: inject a custom vec loader (e.g. a throwing stub). */
  static _openInMemoryWithLoader(loader: VecLoader): DatabaseManager {
    return DatabaseManager.#initInMemory(loader);
  }

  static #initInMemory(loader: VecLoader): DatabaseManager {
    const db = new BetterSqlite3(":memory:");
    return DatabaseManager.#init(db, loader);
  }

  static #init(db: BetterSqlite3.Database, loader: VecLoader): DatabaseManager {
    try {
      loader(db);
    } catch (err) {
      throw new DatabaseError("Failed to load sqlite-vec extension", {
        cause: err,
      });
    }

    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    const manager = new DatabaseManager(db);
    manager.#runMigrations();
    return manager;
  }

  #runMigrations(): void {
    // Bootstrap the meta table before reading schema_version from it
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const row = this.#db
      .prepare<[], { value: string }>("SELECT value FROM meta WHERE key = 'schema_version'")
      .get();

    const currentVersion = row ? Number.parseInt(row.value, 10) : 0;

    for (const [targetVersion, sql] of MIGRATIONS) {
      if (currentVersion < targetVersion) {
        this.#db.exec(sql);
        this.#db
          .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)")
          .run(String(targetVersion));
      }
    }
  }

  get db(): BetterSqlite3.Database {
    return this.#db;
  }

  close(): void {
    this.#db.close();
  }
}
