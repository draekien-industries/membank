import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseManager } from "../db/manager.js";
import { GLOBAL_PROJECT_ID, GLOBAL_SCOPE_HASH } from "../project/domain/global-scope.js";

export { GLOBAL_PROJECT_ID, GLOBAL_SCOPE_HASH };

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../test-fixtures");

export interface TempDatabase {
  db: DatabaseManager;
  path: string;
  cleanup(): void;
}

/**
 * Opens a file-backed database under `test-fixtures/`, exercising the WAL and
 * migration paths an in-memory database skips. `cleanup()` closes the connection
 * and removes the database along with its `-wal` and `-shm` sidecars.
 */
export function openTempDatabase(): TempDatabase {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  const path = join(FIXTURES_DIR, `${randomUUID()}.db`);
  const db = DatabaseManager.open(path);
  return {
    db,
    path,
    cleanup() {
      db.close();
      for (const suffix of ["", "-wal", "-shm"]) {
        rmSync(path + suffix, { force: true });
      }
    },
  };
}

/** A 16-character hex scope hash, the only shape `projects.scope_hash` accepts. */
export function scopeHash(seed = randomUUID()): string {
  return seed
    .replace(/[^0-9a-f]/g, "")
    .padEnd(16, "0")
    .slice(0, 16);
}

export interface SeedProjectOptions {
  id?: string | undefined;
  name?: string | undefined;
  scopeHash?: string | undefined;
  origin?: string | null | undefined;
}

/** Inserts a project, returning its id. Existing rows for the same hash are left alone. */
export function seedProject(db: DatabaseManager, opts: SeedProjectOptions = {}): string {
  const id = opts.id ?? randomUUID();
  const hash = opts.scopeHash ?? scopeHash();
  const now = new Date().toISOString();
  db.mutate(
    `INSERT OR IGNORE INTO projects (id, name, scope_hash, origin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    opts.name ?? `project-${hash.slice(0, 8)}`,
    hash,
    opts.origin ?? null,
    now,
    now
  );
  const row = db.one<{ id: string }>(`SELECT id FROM projects WHERE scope_hash = ?`, hash);
  return row?.id ?? id;
}

export interface SeedMemoryOptions {
  id?: string | undefined;
  content?: string | undefined;
  type?: string | undefined;
  tags?: string[] | undefined;
  source?: string | null | undefined;
  accessCount?: number | undefined;
  pinned?: boolean | undefined;
  durability?: string | null | undefined;
  corroborationCount?: number | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  /** Links the memory to this project id. Omit to leave it unlinked. */
  projectId?: string | undefined;
  /** Writes a `vec0` row alongside the memory. Omit to leave it without an embedding. */
  embedding?: Float32Array | undefined;
}

/** Inserts a memory, returning its id. */
export function seedMemory(db: DatabaseManager, opts: SeedMemoryOptions = {}): string {
  const id = opts.id ?? randomUUID();
  const now = new Date().toISOString();
  db.mutate(
    `INSERT INTO memories
       (id, content, type, tags, source, access_count, pinned, durability,
        corroboration_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    opts.content ?? "a memory",
    opts.type ?? "preference",
    JSON.stringify(opts.tags ?? []),
    opts.source ?? null,
    opts.accessCount ?? 0,
    opts.pinned === true ? 1 : 0,
    opts.durability ?? null,
    opts.corroborationCount ?? 0,
    opts.createdAt ?? now,
    opts.updatedAt ?? opts.createdAt ?? now
  );

  if (opts.projectId !== undefined) {
    linkMemoryToProject(db, id, opts.projectId);
  }
  if (opts.embedding !== undefined) {
    seedEmbedding(db, id, opts.embedding);
  }
  return id;
}

export function linkMemoryToProject(
  db: DatabaseManager,
  memoryId: string,
  projectId: string
): void {
  db.mutate(
    `INSERT OR IGNORE INTO memory_projects (memory_id, project_id) VALUES (?, ?)`,
    memoryId,
    projectId
  );
}

/** Writes the `vec0` row for an already-inserted memory. */
export function seedEmbedding(
  db: DatabaseManager,
  memoryId: string,
  embedding: Float32Array
): void {
  db.mutate(
    `INSERT OR REPLACE INTO embeddings (rowid, embedding)
     SELECT m.rowid, ? FROM memories m WHERE m.id = ?`,
    Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength),
    memoryId
  );
}

/** A 384-dimension unit vector with a single non-zero component. */
export function unitEmbedding(dimension: number, size = 384): Float32Array {
  const vector = new Float32Array(size).fill(0);
  vector[dimension] = 1;
  return vector;
}

export interface SeedSynthesisOptions {
  id?: string | undefined;
  scope?: string | undefined;
  memoryType?: string | undefined;
  content?: string | undefined;
  sourceMemoryHash?: string | undefined;
  synthesizedAt?: string | undefined;
  expiresAt?: string | undefined;
  inFlightSince?: string | null | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
}

/**
 * Inserts a synthesis, returning its id. `scope` must already exist in `projects`
 * — the foreign key is enforced.
 */
export function seedSynthesis(db: DatabaseManager, opts: SeedSynthesisOptions = {}): string {
  const id = opts.id ?? randomUUID();
  const now = new Date().toISOString();
  const synthesizedAt = opts.synthesizedAt ?? now;
  const expiresAt =
    opts.expiresAt ?? new Date(Date.parse(synthesizedAt) + 86_400_000).toISOString();
  db.mutate(
    `INSERT INTO syntheses
       (id, scope, memory_type, content, source_memory_hash, synthesized_at,
        expires_at, in_flight_since, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    opts.scope ?? GLOBAL_SCOPE_HASH,
    opts.memoryType ?? "preference",
    opts.content ?? "a synthesis",
    opts.sourceMemoryHash ?? "hash",
    synthesizedAt,
    expiresAt,
    opts.inFlightSince ?? null,
    opts.createdAt ?? now,
    opts.updatedAt ?? now
  );
  return id;
}

export function setSynthesisInFlight(db: DatabaseManager, scope: string, since: string): void {
  db.mutate(`UPDATE syntheses SET in_flight_since = ? WHERE scope = ?`, since, scope);
}

export interface SeedReviewEventOptions {
  id?: string | undefined;
  memoryId: string;
  conflictingMemoryId?: string | null | undefined;
  similarity?: number | undefined;
  conflictContentSnapshot?: string | undefined;
  reason?: string | undefined;
  createdAt?: string | undefined;
  resolvedAt?: string | null | undefined;
}

/** Inserts a review event, returning its id. */
export function seedReviewEvent(db: DatabaseManager, opts: SeedReviewEventOptions): string {
  const id = opts.id ?? randomUUID();
  db.mutate(
    `INSERT INTO memory_review_events
       (id, memory_id, conflicting_memory_id, similarity, conflict_content_snapshot,
        reason, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    opts.memoryId,
    opts.conflictingMemoryId ?? null,
    opts.similarity ?? 0.85,
    opts.conflictContentSnapshot ?? "a conflicting memory",
    opts.reason ?? "similarity_dedup",
    opts.createdAt ?? new Date().toISOString(),
    opts.resolvedAt ?? null
  );
  return id;
}

export interface SeedExtractionRunOptions {
  sessionId: string;
  startedAt?: string | undefined;
  completedAt?: string | null | undefined;
  status?: "in_flight" | "completed" | "failed" | undefined;
  error?: string | null | undefined;
}

export function seedExtractionRun(db: DatabaseManager, opts: SeedExtractionRunOptions): void {
  const now = new Date().toISOString();
  db.mutate(
    `INSERT INTO extraction_runs (session_id, started_at, completed_at, status, error)
     VALUES (?, ?, ?, ?, ?)`,
    opts.sessionId,
    opts.startedAt ?? now,
    opts.completedAt ?? null,
    opts.status ?? "in_flight",
    opts.error ?? null
  );
}

export interface SeedCapabilityOptions {
  id?: string | undefined;
  kind?: "tool" | "skill" | undefined;
  key: string;
}

/** Inserts a capability, returning its id. */
export function seedCapability(db: DatabaseManager, opts: SeedCapabilityOptions): string {
  const id = opts.id ?? randomUUID();
  const now = new Date().toISOString();
  db.mutate(
    `INSERT OR IGNORE INTO capabilities (id, kind, key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    id,
    opts.kind ?? "tool",
    opts.key,
    now,
    now
  );
  const row = db.one<{ id: string }>(`SELECT id FROM capabilities WHERE key = ?`, opts.key);
  return row?.id ?? id;
}

export interface SeedActivityEventOptions {
  id?: string | undefined;
  projectHash: string;
  eventType?: string | undefined;
  memoryId?: string | null | undefined;
  payload?: string | undefined;
  createdAt?: string | undefined;
}

export function seedActivityEvent(db: DatabaseManager, opts: SeedActivityEventOptions): string {
  const id = opts.id ?? randomUUID();
  db.mutate(
    `INSERT INTO activity_events (id, project_hash, event_type, memory_id, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    opts.projectHash,
    opts.eventType ?? "memory_saved",
    opts.memoryId ?? null,
    opts.payload ?? "{}",
    opts.createdAt ?? new Date().toISOString()
  );
  return id;
}

export interface SeedSynthesisVersionOptions {
  scope: string;
  memoryType?: string | undefined;
  version?: number | undefined;
  content?: string | undefined;
  sourceMemoryHash?: string | undefined;
  synthesizedAt?: string | undefined;
  createdAt?: string | undefined;
}

export function seedSynthesisVersion(db: DatabaseManager, opts: SeedSynthesisVersionOptions): void {
  const now = new Date().toISOString();
  db.mutate(
    `INSERT INTO synthesis_versions
       (scope, memory_type, version, content, source_memory_hash, synthesized_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    opts.scope,
    opts.memoryType ?? "preference",
    opts.version ?? 1,
    opts.content ?? "a synthesis",
    opts.sourceMemoryHash ?? "hash",
    opts.synthesizedAt ?? now,
    opts.createdAt ?? now
  );
}

export function linkMemoryToCapability(
  db: DatabaseManager,
  memoryId: string,
  capabilityId: string
): void {
  db.mutate(
    `INSERT OR IGNORE INTO memory_capabilities (memory_id, capability_id) VALUES (?, ?)`,
    memoryId,
    capabilityId
  );
}

export type CountableTable =
  | "memories"
  | "memory_projects"
  | "memory_review_events"
  | "memory_versions"
  | "projects"
  | "syntheses"
  | "synthesis_versions"
  | "capabilities"
  | "memory_capabilities"
  | "extraction_runs"
  | "embeddings";

/**
 * Row count for a table, for assertions that care about persistence rather than shape.
 * The table name is interpolated, so the union keeps both SQL injection and unbounded
 * statement-cache growth out of reach.
 */
export function countRows(db: DatabaseManager, table: CountableTable): number {
  const row = db.one<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
  return row?.count ?? 0;
}
