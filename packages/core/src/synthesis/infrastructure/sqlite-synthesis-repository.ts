import { createHash, randomUUID } from "node:crypto";
import type { DatabaseManager } from "../../db/manager.js";
import { rowToSynthesisVersion } from "../../persistence/infrastructure/row-types.js";
import type { Synthesis, SynthesisVersionRow } from "../../schemas.js";
import { SynthesisSchema } from "../../schemas.js";
import type { DirtyScope } from "../domain/synthesis-job.js";
import type { SynthesisVersion } from "../domain/synthesis-version.js";
import type { SynthesisRepository } from "../ports.js";

interface SynthesisRow {
  id: string;
  scope: string;
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

  saveSynthesis(scope: string, content: string, sourceHash: string): Synthesis {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + STALENESS_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { id, createdAt } = this.#db.db.transaction(() => {
      const existing = this.#db.db
        .prepare<[string], SynthesisRow>("SELECT * FROM syntheses WHERE scope = ?")
        .get(scope);

      if (existing !== undefined) {
        if (!isPlaceholderRow(existing)) {
          this.#archiveCurrentSynthesis(scope);
        }
        this.#db.db
          .prepare(
            `UPDATE syntheses
             SET content = ?, source_memory_hash = ?, synthesized_at = ?, expires_at = ?,
                 in_flight_since = NULL, updated_at = ?
             WHERE scope = ?`
          )
          .run(content, sourceHash, now, expiresAt, now, scope);
        return { id: existing.id, createdAt: existing.created_at };
      }

      const newId = randomUUID();
      this.#db.db
        .prepare(
          `INSERT INTO syntheses
             (id, scope, content, source_memory_hash, synthesized_at, expires_at,
              in_flight_since, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`
        )
        .run(newId, scope, content, sourceHash, now, expiresAt, now, now);
      return { id: newId, createdAt: now };
    })();

    return SynthesisSchema.parse({
      id,
      scope,
      content,
      sourceMemoryHash: sourceHash,
      synthesizedAt: now,
      expiresAt,
      inFlightSince: null,
      createdAt,
      updatedAt: now,
    });
  }

  listVersions(scope: string): SynthesisVersion[] {
    const rows = this.#db.db
      .prepare<[string], SynthesisVersionRow>(
        `SELECT * FROM synthesis_versions WHERE scope = ? ORDER BY version DESC`
      )
      .all(scope);
    return rows.map(rowToSynthesisVersion);
  }

  getVersion(scope: string, version: number): SynthesisVersion | undefined {
    const row = this.#db.db
      .prepare<[string, number], SynthesisVersionRow>(
        `SELECT * FROM synthesis_versions WHERE scope = ? AND version = ?`
      )
      .get(scope, version);
    return row !== undefined ? rowToSynthesisVersion(row) : undefined;
  }

  #archiveCurrentSynthesis(scope: string): void {
    const snapshot = this.#db.db
      .prepare<
        [string],
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
         LEFT JOIN synthesis_versions v ON v.scope = s.scope
         WHERE s.scope = ?
         GROUP BY s.scope`
      )
      .get(scope);
    if (snapshot === undefined) return;

    this.#db.db
      .prepare(
        `INSERT INTO synthesis_versions (scope, version, content, source_memory_hash, synthesized_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        scope,
        snapshot.next_version,
        snapshot.content,
        snapshot.source_memory_hash,
        snapshot.synthesized_at
      );

    this.#db.db
      .prepare(`DELETE FROM synthesis_versions WHERE scope = ? AND version <= ?`)
      .run(scope, snapshot.next_version - MAX_SYNTHESIS_VERSIONS);
  }

  getSynthesis(scope: string): Synthesis | undefined {
    const row = this.#db.db
      .prepare<[string], SynthesisRow>("SELECT * FROM syntheses WHERE scope = ?")
      .get(scope);
    return row !== undefined ? rowToSynthesis(row) : undefined;
  }

  listAll(): Synthesis[] {
    const rows = this.#db.db
      .prepare<[], SynthesisRow>("SELECT * FROM syntheses ORDER BY scope")
      .all();
    return rows.map(rowToSynthesis);
  }

  markInFlight(scope: string): void {
    const now = new Date().toISOString();
    const existing = this.#db.db
      .prepare<[string], { id: string }>("SELECT id FROM syntheses WHERE scope = ?")
      .get(scope);

    if (existing !== undefined) {
      this.#db.db
        .prepare("UPDATE syntheses SET in_flight_since = ?, updated_at = ? WHERE scope = ?")
        .run(now, now, scope);
    } else {
      const id = randomUUID();
      const future = new Date(Date.now() + STALENESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
      this.#db.db
        .prepare(
          `INSERT INTO syntheses
             (id, scope, content, source_memory_hash, synthesized_at, expires_at,
              in_flight_since, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, scope, "pending", "", now, future, now, now, now);
    }
  }

  clearInFlight(scope: string): void {
    const now = new Date().toISOString();
    this.#db.db
      .prepare("UPDATE syntheses SET in_flight_since = NULL, updated_at = ? WHERE scope = ?")
      .run(now, scope);
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

  sourceMemoryHash(scope: string): string {
    const contents = this.#db.db
      .prepare<[string], { content: string }>(
        `SELECT m.content FROM memories m
         JOIN memory_projects mp ON mp.memory_id = m.id
         JOIN projects p ON p.id = mp.project_id
         WHERE p.scope_hash = ?
         ORDER BY m.id`
      )
      .all(scope);

    return createHash("sha256")
      .update(JSON.stringify(contents.map((r) => r.content)))
      .digest("hex");
  }

  getExpiredOrDirtyScopes(): DirtyScope[] {
    const allScopes = this.getAllActiveScopes();
    const now = new Date().toISOString();
    const results: DirtyScope[] = [];

    for (const scope of allScopes) {
      const row = this.#db.db
        .prepare<[string], SynthesisRow>("SELECT * FROM syntheses WHERE scope = ?")
        .get(scope);

      if (row === undefined || isPlaceholderRow(row)) {
        results.push({ scope, reason: "missing" });
        continue;
      }

      if (row.expires_at <= now) {
        results.push({ scope, reason: "expired" });
        continue;
      }

      const currentHash = this.sourceMemoryHash(scope);
      if (currentHash !== row.source_memory_hash) {
        results.push({ scope, reason: "dirty" });
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
}

export function createSynthesisRepository(db: DatabaseManager): SynthesisRepository {
  return new SqliteSynthesisRepository(db);
}
