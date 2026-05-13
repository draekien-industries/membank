import { createHash, randomUUID } from "node:crypto";
import type { DatabaseManager } from "../db/manager.js";
import type { Synthesis } from "../schemas.js";
import { SynthesisSchema } from "../schemas.js";

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

const STALENESS_DAYS = 30;

export class SynthesisRepository {
  readonly #db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.#db = db;
  }

  saveSynthesis(scope: string, content: string, sourceHash: string): Synthesis {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + STALENESS_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const existing = this.#db.db
      .prepare<[string], { id: string }>("SELECT id FROM syntheses WHERE scope = ?")
      .get(scope);

    if (existing !== undefined) {
      this.#db.db
        .prepare(
          `UPDATE syntheses
           SET content = ?, source_memory_hash = ?, synthesized_at = ?, expires_at = ?,
               in_flight_since = NULL, updated_at = ?
           WHERE scope = ?`
        )
        .run(content, sourceHash, now, expiresAt, now, scope);
    } else {
      const id = randomUUID();
      this.#db.db
        .prepare(
          `INSERT INTO syntheses
             (id, scope, content, source_memory_hash, synthesized_at, expires_at,
              in_flight_since, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`
        )
        .run(id, scope, content, sourceHash, now, expiresAt, now, now);
    }

    const row = this.#db.db
      .prepare<[string], SynthesisRow>("SELECT * FROM syntheses WHERE scope = ?")
      .get(scope);

    if (row === undefined) throw new Error(`Failed to save synthesis for scope: ${scope}`);
    return rowToSynthesis(row);
  }

  getSynthesis(scope: string): Synthesis | undefined {
    const row = this.#db.db
      .prepare<[string], SynthesisRow>("SELECT * FROM syntheses WHERE scope = ?")
      .get(scope);
    return row !== undefined ? rowToSynthesis(row) : undefined;
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
      // Create a placeholder row so in_flight_since is tracked before the first synthesis
      const id = randomUUID();
      const placeholder = "pending";
      const future = new Date(Date.now() + STALENESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
      this.#db.db
        .prepare(
          `INSERT INTO syntheses
             (id, scope, content, source_memory_hash, synthesized_at, expires_at,
              in_flight_since, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, scope, placeholder, "", now, future, now, now, now);
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

  computeSourceMemoryHash(scope: string): string {
    let contents: { content: string }[];

    if (scope === "global") {
      contents = this.#db.db
        .prepare<[], { content: string }>(
          `SELECT content FROM memories
           WHERE id NOT IN (SELECT memory_id FROM memory_projects)
           ORDER BY id`
        )
        .all();
    } else {
      contents = this.#db.db
        .prepare<[string], { content: string }>(
          `SELECT m.content FROM memories m
           JOIN memory_projects mp ON mp.memory_id = m.id
           JOIN projects p ON p.id = mp.project_id
           WHERE p.scope_hash = ?
           ORDER BY m.id`
        )
        .all(scope);
    }

    return createHash("sha256")
      .update(JSON.stringify(contents.map((r) => r.content)))
      .digest("hex");
  }

  getExpiredOrDirtyScopes(): { scope: string; reason: "expired" | "dirty" | "missing" }[] {
    const allScopes = this.getAllActiveScopes();
    const now = new Date().toISOString();
    const results: { scope: string; reason: "expired" | "dirty" | "missing" }[] = [];

    for (const scope of allScopes) {
      const row = this.#db.db
        .prepare<[string], SynthesisRow>("SELECT * FROM syntheses WHERE scope = ?")
        .get(scope);

      if (row === undefined || (row.content === "pending" && row.source_memory_hash === "")) {
        results.push({ scope, reason: "missing" });
        continue;
      }

      if (row.expires_at <= now) {
        results.push({ scope, reason: "expired" });
        continue;
      }

      const currentHash = this.computeSourceMemoryHash(scope);
      if (currentHash !== row.source_memory_hash) {
        results.push({ scope, reason: "dirty" });
      }
    }

    return results;
  }

  getAllActiveScopes(): string[] {
    const projectScopes = this.#db.db
      .prepare<[], { scope_hash: string }>("SELECT DISTINCT scope_hash FROM projects")
      .all()
      .map((r) => r.scope_hash);

    return ["global", ...projectScopes];
  }

  expireStale(): void {
    const now = new Date().toISOString();
    this.#db.db.prepare("DELETE FROM syntheses WHERE expires_at < ?").run(now);
  }
}
