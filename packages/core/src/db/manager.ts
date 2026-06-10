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
  [
    4,
    `
CREATE TABLE IF NOT EXISTS syntheses (
  id                  TEXT PRIMARY KEY,
  scope               TEXT NOT NULL,
  content             TEXT NOT NULL,
  source_memory_hash  TEXT NOT NULL,
  synthesized_at      TEXT NOT NULL,
  expires_at          TEXT NOT NULL,
  in_flight_since     TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE(scope),
  CHECK(expires_at > synthesized_at)
);

CREATE INDEX IF NOT EXISTS idx_syntheses_expires_at
  ON syntheses(expires_at);

CREATE INDEX IF NOT EXISTS idx_syntheses_scope_inflight
  ON syntheses(scope) WHERE in_flight_since IS NOT NULL;
`,
  ],
  [
    5,
    `
PRAGMA foreign_keys = OFF;

BEGIN;

-- Rescue associations from corrupt projects by relinking them to a valid project with the same name
INSERT OR IGNORE INTO memory_projects (memory_id, project_id)
SELECT mp.memory_id, (
  SELECT p_good.id
  FROM projects p_good
  WHERE p_good.name = p_bad.name
    AND length(p_good.scope_hash) = 16
    AND trim(p_good.scope_hash, '0123456789abcdef') = ''
  ORDER BY p_good.created_at
  LIMIT 1
)
FROM memory_projects mp
JOIN projects p_bad ON p_bad.id = mp.project_id
WHERE (length(p_bad.scope_hash) != 16 OR trim(p_bad.scope_hash, '0123456789abcdef') != '')
  AND EXISTS (
    SELECT 1 FROM projects p_good
    WHERE p_good.name = p_bad.name
      AND length(p_good.scope_hash) = 16
      AND trim(p_good.scope_hash, '0123456789abcdef') = ''
  );

-- Drop all associations to corrupt projects (memories with no valid counterpart become global)
DELETE FROM memory_projects
WHERE project_id IN (
  SELECT id FROM projects
  WHERE length(scope_hash) != 16 OR trim(scope_hash, '0123456789abcdef') != ''
);

-- Delete corrupt projects
DELETE FROM projects
WHERE length(scope_hash) != 16 OR trim(scope_hash, '0123456789abcdef') != '';

-- Recreate projects table with CHECK constraint on scope_hash
-- SQLite requires table recreation to add CHECK constraints
DROP TABLE IF EXISTS projects_new;

CREATE TABLE projects_new (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  scope_hash TEXT NOT NULL UNIQUE
               CHECK(length(scope_hash) = 16 AND trim(scope_hash, '0123456789abcdef') = ''),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO projects_new SELECT * FROM projects;

DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

COMMIT;

PRAGMA foreign_keys = ON;
`,
  ],
  [
    6,
    `
CREATE TABLE IF NOT EXISTS extraction_runs (
  session_id   TEXT PRIMARY KEY,
  started_at   TEXT NOT NULL,
  completed_at TEXT,
  status       TEXT NOT NULL CHECK(status IN ('in_flight', 'completed', 'failed')),
  error        TEXT
);

CREATE INDEX IF NOT EXISTS idx_extraction_runs_status
  ON extraction_runs(status) WHERE status = 'in_flight';
`,
  ],
  [
    7,
    `
INSERT OR IGNORE INTO projects (id, name, scope_hash, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'global', '0000000000000000', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO memory_projects (memory_id, project_id)
SELECT id, '00000000-0000-0000-0000-000000000000'
FROM memories
WHERE id NOT IN (SELECT memory_id FROM memory_projects);
`,
  ],
  [
    8,
    `
PRAGMA foreign_keys = OFF;

BEGIN;

UPDATE syntheses SET scope = '0000000000000000' WHERE scope = 'global';

DROP TABLE IF EXISTS syntheses_new;

CREATE TABLE syntheses_new (
  id                  TEXT PRIMARY KEY,
  scope               TEXT NOT NULL REFERENCES projects(scope_hash) ON DELETE CASCADE,
  content             TEXT NOT NULL,
  source_memory_hash  TEXT NOT NULL,
  synthesized_at      TEXT NOT NULL,
  expires_at          TEXT NOT NULL,
  in_flight_since     TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE(scope),
  CHECK(expires_at > synthesized_at)
);

INSERT INTO syntheses_new SELECT * FROM syntheses;

DROP TABLE syntheses;
ALTER TABLE syntheses_new RENAME TO syntheses;

CREATE INDEX IF NOT EXISTS idx_syntheses_expires_at ON syntheses(expires_at);
CREATE INDEX IF NOT EXISTS idx_syntheses_scope_inflight
  ON syntheses(scope) WHERE in_flight_since IS NOT NULL;

COMMIT;

PRAGMA foreign_keys = ON;
`,
  ],
  [
    9,
    `
CREATE TABLE activity_events (
  id           TEXT PRIMARY KEY,
  project_hash TEXT NOT NULL REFERENCES projects(scope_hash) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  memory_id    TEXT,
  payload      TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX idx_activity_project_created ON activity_events(project_hash, created_at DESC);
CREATE INDEX idx_activity_type_created    ON activity_events(event_type, created_at DESC);
`,
  ],
  [
    10,
    `
ALTER TABLE activity_events RENAME TO activity_events_old;

CREATE TABLE activity_events (
  id           TEXT PRIMARY KEY,
  project_hash TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  memory_id    TEXT,
  payload      TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

INSERT INTO activity_events SELECT * FROM activity_events_old;
DROP TABLE activity_events_old;

CREATE INDEX idx_activity_project_created ON activity_events(project_hash, created_at DESC);
CREATE INDEX idx_activity_type_created    ON activity_events(event_type, created_at DESC);
`,
  ],
  [
    11,
    `
PRAGMA foreign_keys = OFF;

BEGIN;

CREATE TABLE memory_review_events_new (
  id                        TEXT PRIMARY KEY,
  memory_id                 TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  conflicting_memory_id     TEXT REFERENCES memories(id) ON DELETE CASCADE,
  similarity                REAL NOT NULL,
  conflict_content_snapshot TEXT NOT NULL,
  reason                    TEXT NOT NULL,
  created_at                TEXT NOT NULL,
  resolved_at               TEXT
);

INSERT INTO memory_review_events_new SELECT * FROM memory_review_events;

DROP TABLE memory_review_events;
ALTER TABLE memory_review_events_new RENAME TO memory_review_events;

CREATE INDEX IF NOT EXISTS idx_review_events_memory_open
  ON memory_review_events(memory_id) WHERE resolved_at IS NULL;

COMMIT;

PRAGMA foreign_keys = ON;
`,
  ],
  [
    12,
    `
CREATE TABLE memory_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id   TEXT    NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  content     TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (memory_id, version)
);

CREATE INDEX idx_memory_versions_memory_id ON memory_versions(memory_id, version DESC);
`,
  ],
  [
    13,
    `
CREATE TABLE synthesis_versions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  scope              TEXT    NOT NULL REFERENCES projects(scope_hash) ON DELETE CASCADE,
  version            INTEGER NOT NULL,
  content            TEXT    NOT NULL,
  source_memory_hash TEXT    NOT NULL,
  synthesized_at     TEXT    NOT NULL,
  created_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (scope, version)
);

CREATE INDEX idx_synthesis_versions_scope ON synthesis_versions(scope, version DESC);
`,
  ],
  [
    14,
    `
ALTER TABLE projects ADD COLUMN origin TEXT;
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
