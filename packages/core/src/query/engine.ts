import type { DatabaseManager } from "../db/manager.js";
import type { EmbeddingService } from "../embedding/service.js";
import type { MemoryRepository } from "../memory/repository.js";
import type { Memory, MemoryType, QueryOptions } from "../types.js";

interface MemoryRow {
  id: string;
  content: string;
  type: string;
  tags: string;
  scope: string;
  source: string | null;
  access_count: number;
  pinned: number;
  needs_review: number;
  created_at: string;
  updated_at: string;
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
    const { query, type, scope, limit = 10 } = options;

    const queryEmbedding = await this.#embedding.embed(query);
    const queryBlob = Buffer.from(queryEmbedding.buffer);

    const whereClauses: string[] = [];
    const params: unknown[] = [queryBlob];

    if (type !== undefined) {
      whereClauses.push("m.type = ?");
      params.push(type);
    }

    if (scope !== undefined) {
      whereClauses.push("m.scope = ?");
      params.push(scope);
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const sql = `
      SELECT m.*, (1 - vec_distance_cosine(e.embedding, ?)) AS cosine_sim
      FROM memories m JOIN embeddings e ON e.rowid = m.rowid
      ${whereSQL}
    `;

    const rows = this.#db.db.prepare<unknown[], MemoryRow>(sql).all(...params);

    const now = Date.now();

    const scored = rows
      .filter((row) => row.cosine_sim > 0)
      .map((row) => {
        const memory = this.#rowToMemory(row);
        const score = this.#computeScore(memory, now);
        return { ...memory, score };
      });

    scored.sort((a, b) => b.score - a.score);

    const results = scored.slice(0, limit);

    for (const result of results) {
      this.#repo.incrementAccessCount(result.id);
    }

    return results;
  }

  #computeScore(memory: Memory, now: number): number {
    const typeWeight = TYPE_WEIGHTS[memory.type];
    const accessCountNorm = memory.accessCount / (memory.accessCount + 10);
    const daysSinceUpdate = (now - new Date(memory.updatedAt).getTime()) / 86400000;
    const recencyNorm = 1 / (1 + daysSinceUpdate);
    const pinned = memory.pinned ? 1.0 : 0.0;

    return typeWeight * 0.4 + accessCountNorm * 0.3 + recencyNorm * 0.2 + pinned * 0.1;
  }

  #rowToMemory(row: MemoryRow): Memory {
    return {
      id: row.id,
      content: row.content,
      type: row.type as MemoryType,
      tags: JSON.parse(row.tags) as string[],
      scope: row.scope,
      sourceHarness: row.source,
      accessCount: row.access_count,
      pinned: row.pinned !== 0,
      needsReview: row.needs_review !== 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
