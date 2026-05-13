import type { DatabaseManager } from "../../db/manager.js";
import type { Memory, MemoryType } from "../../memory/domain/memory.js";
import { rowToMemory } from "../../persistence/infrastructure/row-types.js";
import type { MemoryRow } from "../../types.js";
import type { QueryAdapter } from "../ports.js";

interface QueryMemoryRow extends MemoryRow {
  cosine_sim: number;
}

export class SqliteQueryAdapter implements QueryAdapter {
  readonly #db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.#db = db;
  }

  findByEmbedding(
    embedding: Buffer,
    opts: { type?: MemoryType; projectHash?: string; includePinned?: boolean }
  ): Array<Memory & { cosineSim: number }> {
    const { type, projectHash, includePinned } = opts;
    const whereClauses: string[] = [];
    const params: unknown[] = [embedding];
    let joinClause = "";

    if (!includePinned) {
      whereClauses.push("m.pinned = 0");
    }
    if (type !== undefined) {
      whereClauses.push("m.type = ?");
      params.push(type);
    }
    if (projectHash !== undefined) {
      joinClause =
        "LEFT JOIN memory_projects mp ON mp.memory_id = m.id LEFT JOIN projects p ON p.id = mp.project_id";
      whereClauses.push("p.scope_hash = ?");
      params.push(projectHash);
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const sql = `
      SELECT m.*, (1 - vec_distance_cosine(e.embedding, ?)) AS cosine_sim
      FROM memories m JOIN embeddings e ON e.rowid = m.rowid
      ${joinClause}
      ${whereSQL}
    `;

    const rows = this.#db.db.prepare<unknown[], QueryMemoryRow>(sql).all(...params);
    return rows.map((row) => ({ ...rowToMemory(row, []), cosineSim: row.cosine_sim }));
  }
}
