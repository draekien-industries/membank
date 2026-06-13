import { createHash, randomUUID } from "node:crypto";
import type { DatabaseManager } from "../../db/manager.js";
import { rowToSynthesisVersion } from "../../persistence/infrastructure/row-types.js";
import type { MemoryType, Synthesis, SynthesisVersionRow } from "../../schemas.js";
import { SynthesisSchema } from "../../schemas.js";
import type { DirtyScope } from "../domain/synthesis-job.js";
import type { SynthesisVersion } from "../domain/synthesis-version.js";
import type { SynthesisRepository } from "../ports.js";

interface SynthesisRow {
  id: string;
  scope: string;
  memory_type: MemoryType;
  content: string;
  source_memory_hash: string;
  synthesized_at: string;
  expires_at: string;
  in_flight_since: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSynthesis(row: SynthesisRow): Synthesis {
  return SynthesisSchema.parse({
    id: row.id,
    scope: row.scope,
    memoryType: row.memory_type,
    content: row.content,
    sourceMemoryHash: row.source_memory_hash,
    synthesizedAt: row.synthesized_at,
    expiresAt: row.expires_at,
    inFlightSince: row.in_flight_since,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function isPlaceholderRow(row: { content: string; source_memory_hash: string }): boolean {
  return row.content === "pending" && row.source_memory_hash === "";
}

const STALENESS_DAYS = 30;
const MAX_SYNTHESIS_VERSIONS = 5;

class SqliteSynthesisRepository implements SynthesisRepository {
  readonly #db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.#db = db;
  }

  saveSynthesis(
    scope: string,
    memoryType: MemoryType,
    content: string,
    sourceHash: string
  ): Synthesis {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + STALENESS_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { id, createdAt } = this.#db.db.transaction(() => {
      const existing = this.#db.db
        .prepare<[string, string], SynthesisRow>(
          "SELECT * FROM syntheses WHERE scope = ? AND memory_type = ?"
        )
        .get(scope, memoryType);

      if (existing !== undefined) {
        if (!isPlaceholderRow(existing)) {
          this.#archiveCurrentSynthesis(scope, memoryType);
        }
        this.#db.db
          .prepare(
            `UPDATE syntheses
             SET content = ?, source_memory_hash = ?, synthesized_at = ?, expires_at = ?,
                 in_flight_since = NULL, updated_at = ?
             WHERE scope = ? AND memory_type = ?`
          )
          .run(content, sourceHash, now, expiresAt, now, scope, memoryType);
        return { id: existing.id, createdAt: existing.created_at };
      }

      const newId = randomUUID();
      this.#db.db
        .prepare(
          `INSERT INTO syntheses
             (id, scope, memory_type, content, source_memory_hash, synthesized_at, expires_at,
              in_flight_since, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
        )
        .run(newId, scope, memoryType, content, sourceHash, now, expiresAt, now, now);
      return { id: newId, createdAt: now };
    })();

    return SynthesisSchema.parse({
      id,
      scope,
      memoryType,
      content,
      sourceMemoryHash: sourceHash,
      synthesizedAt: now,
      expiresAt,
      inFlightSince: null,
      createdAt,
      updatedAt: now,
    });
  }

  listVersions(scope: string, memoryType: MemoryType): SynthesisVersion[] {
    const rows = this.#db.db
      .prepare<[string, string], SynthesisVersionRow>(
        `SELECT * FROM synthesis_versions WHERE scope = ? AND memory_type = ? ORDER BY version DESC`
      )
      .all(scope, memoryType);
    return rows.map(rowToSynthesisVersion);
  }

  getVersion(scope: string, memoryType: MemoryType, version: number): SynthesisVersion | undefined {
    const row = this.#db.db
      .prepare<[string, string, number], SynthesisVersionRow>(
        `SELECT * FROM synthesis_versions WHERE scope = ? AND memory_type = ? AND version = ?`
      )
      .get(scope, memoryType, version);
    return row !== undefined ? rowToSynthesisVersion(row) : undefined;
  }

  #archiveCurrentSynthesis(scope: string, memoryType: MemoryType): void {
    const snapshot = this.#db.db
      .prepare<
        [string, string],
        {
          content: string;
          source_memory_hash: string;
          synthesized_at: string;
          next_version: number;
        }
      >(
        `SELECT s.content, s.source_memory_hash, s.synthesized_at,
                COALESCE(MAX(v.version), 0) + 1 AS next_version
         FROM syntheses s
         LEFT JOIN synthesis_versions v
           ON v.scope = s.scope AND v.memory_type = s.memory_type
         WHERE s.scope = ? AND s.memory_type = ?
         GROUP BY s.scope, s.memory_type`
      )
      .get(scope, memoryType);
    if (snapshot === undefined) return;

    this.#db.db
      .prepare(
        `INSERT INTO synthesis_versions
           (scope, memory_type, version, content, source_memory_hash, synthesized_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        scope,
        memoryType,
        snapshot.next_version,
        snapshot.content,
        snapshot.source_memory_hash,
        snapshot.synthesized_at
      );

    this.#db.db
      .prepare(
        `DELETE FROM synthesis_versions
         WHERE scope = ? AND memory_type = ? AND version <= ?`
      )
      .run(scope, memoryType, snapshot.next_version - MAX_SYNTHESIS_VERSIONS);
  }

  getSynthesis(scope: string, memoryType: MemoryType): Synthesis | undefined {
    const row = this.#db.db
      .prepare<[string, string], SynthesisRow>(
        "SELECT * FROM syntheses WHERE scope = ? AND memory_type = ?"
      )
      .get(scope, memoryType);
    return row !== undefined ? rowToSynthesis(row) : undefined;
  }

  listAll(): Synthesis[] {
    const rows = this.#db.db
      .prepare<[], SynthesisRow>("SELECT * FROM syntheses ORDER BY scope, memory_type")
      .all();
    return rows.map(rowToSynthesis);
  }

  markInFlight(scope: string, memoryType: MemoryType): void {
    const now = new Date().toISOString();
    const existing = this.#db.db
      .prepare<[string, string], { id: string }>(
        "SELECT id FROM syntheses WHERE scope = ? AND memory_type = ?"
      )
      .get(scope, memoryType);

    if (existing !== undefined) {
      this.#db.db
        .prepare(
          "UPDATE syntheses SET in_flight_since = ?, updated_at = ? WHERE scope = ? AND memory_type = ?"
        )
        .run(now, now, scope, memoryType);
    } else {
      const id = randomUUID();
      const future = new Date(Date.now() + STALENESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
      this.#db.db
        .prepare(
          `INSERT INTO syntheses
             (id, scope, memory_type, content, source_memory_hash, synthesized_at, expires_at,
              in_flight_since, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, scope, memoryType, "pending", "", now, future, now, now, now);
    }
  }

  clearInFlight(scope: string, memoryType: MemoryType): void {
    const now = new Date().toISOString();
    this.#db.db
      .prepare(
        "UPDATE syntheses SET in_flight_since = NULL, updated_at = ? WHERE scope = ? AND memory_type = ?"
      )
      .run(now, scope, memoryType);
  }

  clearStaleInFlight(thresholdMs: number): void {
    const cutoff = new Date(Date.now() - thresholdMs).toISOString();
    const now = new Date().toISOString();
    this.#db.db
      .prepare(
        "UPDATE syntheses SET in_flight_since = NULL, updated_at = ? WHERE in_flight_since IS NOT NULL AND in_flight_since < ?"
      )
      .run(now, cutoff);
  }

  nonPinnedMemoryContents(scope: string, memoryType: MemoryType): string[] {
    return this.#db.db
      .prepare<[string, string], { content: string }>(
        `SELECT m.content FROM memories m
         JOIN memory_projects mp ON mp.memory_id = m.id
         JOIN projects p ON p.id = mp.project_id
         WHERE p.scope_hash = ? AND m.type = ? AND m.pinned = 0
         ORDER BY m.id`
      )
      .all(scope, memoryType)
      .map((r) => r.content);
  }

  sourceMemoryHash(scope: string, memoryType: MemoryType): string {
    const contents = this.#db.db
      .prepare<[string, string], { content: string }>(
        `SELECT m.content FROM memories m
         JOIN memory_projects mp ON mp.memory_id = m.id
         JOIN projects p ON p.id = mp.project_id
         WHERE p.scope_hash = ? AND m.type = ?
         ORDER BY m.id`
      )
      .all(scope, memoryType);

    return createHash("sha256")
      .update(JSON.stringify(contents.map((r) => r.content)))
      .digest("hex");
  }

  getExpiredOrDirtyScopes(): DirtyScope[] {
    const now = new Date().toISOString();
    const results: DirtyScope[] = [];

    const scopeTypes = this.#db.db
      .prepare<[], { scope: string; memory_type: MemoryType }>(
        `SELECT DISTINCT p.scope_hash AS scope, m.type AS memory_type
         FROM memories m
         JOIN memory_projects mp ON mp.memory_id = m.id
         JOIN projects p ON p.id = mp.project_id`
      )
      .all();

    for (const { scope, memory_type: memoryType } of scopeTypes) {
      const row = this.#db.db
        .prepare<[string, string], SynthesisRow>(
          "SELECT * FROM syntheses WHERE scope = ? AND memory_type = ?"
        )
        .get(scope, memoryType);

      if (row === undefined || isPlaceholderRow(row)) {
        results.push({ scope, memoryType, reason: "missing" });
        continue;
      }

      if (row.expires_at <= now) {
        results.push({ scope, memoryType, reason: "expired" });
        continue;
      }

      const currentHash = this.sourceMemoryHash(scope, memoryType);
      if (currentHash !== row.source_memory_hash) {
        results.push({ scope, memoryType, reason: "dirty" });
      }
    }

    return results;
  }

  getAllActiveScopes(): string[] {
    return this.#db.db
      .prepare<[], { scope_hash: string }>("SELECT DISTINCT scope_hash FROM projects")
      .all()
      .map((r) => r.scope_hash);
  }

  expireStale(): void {
    const now = new Date().toISOString();
    this.#db.db.prepare("DELETE FROM syntheses WHERE expires_at < ?").run(now);
  }

  initializeAndGetDirtyScopes(inFlightTimeoutMs: number): DirtyScope[] {
    return this.#db.db.transaction(() => {
      this.clearStaleInFlight(inFlightTimeoutMs);
      this.expireStale();
      return this.getExpiredOrDirtyScopes();
    })();
  }
}

export function createSynthesisRepository(db: DatabaseManager): SynthesisRepository {
  return new SqliteSynthesisRepository(db);
}
