import type { DatabaseManager } from "../db/manager.js";
import type { EmbeddingService } from "../embedding/service.js";
import type { MemoryRepository } from "../memory/ports.js";
import { rowToMemory } from "../persistence/infrastructure/row-types.js";
import { QueryOptionsSchema } from "../schemas.js";
import type { Memory, MemoryRow, MemoryType, QueryOptions } from "../types.js";

interface QueryMemoryRow extends MemoryRow {
  cosine_sim: number;
}

const TYPE_WEIGHTS = {
  correction: 1.0,
  preference: 0.8,
  decision: 0.6,
  learning: 0.4,
  fact: 0.2,
} satisfies Record<MemoryType, number>;

export class QueryEngine {
  readonly #db: DatabaseManager;
  readonly #embedding: EmbeddingService;
  readonly #repo: MemoryRepository;

  constructor(db: DatabaseManager, embeddingService: EmbeddingService, repo: MemoryRepository) {
    this.#db = db;
    this.#embedding = embeddingService;
    this.#repo = repo;
  }

  async query(options: QueryOptions): Promise<Array<Memory & { score: number }>> {
    const {
      query,
      type,
      projectHash,
      limit = 10,
      includePinned,
    } = QueryOptionsSchema.parse(options);

    const queryEmbedding = await this.#embedding.embed(query);
    const queryBlob = Buffer.from(queryEmbedding.buffer);

    const whereClauses: string[] = [];
    const params: unknown[] = [queryBlob];
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

    const now = Date.now();

    const scored = rows
      .filter((row) => row.cosine_sim > 0)
      .map((row) => {
        const memory = rowToMemory(row, []);
        const score = this.#computeScore(memory, row.cosine_sim, now);
        return { ...memory, score };
      });

    scored.sort((a, b) => b.score - a.score);

    const results = scored.slice(0, limit);

    for (const result of results) {
      this.#repo.incrementAccessCount(result.id);
    }

    return results;
  }

  #computeScore(memory: Memory, cosine_sim: number, now: number): number {
    const typeWeight = TYPE_WEIGHTS[memory.type];
    const accessCountNorm = memory.accessCount / (memory.accessCount + 10);
    const daysSinceUpdate = (now - new Date(memory.updatedAt).getTime()) / 86400000;
    const recencyNorm = 1 / (1 + daysSinceUpdate);
    const pinned = memory.pinned ? 1.0 : 0.0;

    return (
      cosine_sim * 0.4 +
      typeWeight * 0.25 +
      accessCountNorm * 0.2 +
      recencyNorm * 0.1 +
      pinned * 0.05
    );
  }
}
