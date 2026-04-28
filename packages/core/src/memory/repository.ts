import { randomUUID } from "node:crypto";
import type { DatabaseManager } from "../db/manager.js";
import type { MemoryRow } from "../db/row-types.js";
import { rowToMemory } from "../db/row-types.js";
import type { EmbeddingService } from "../embedding/service.js";
import type { Memory, MemoryType, SaveOptions } from "../types.js";
import { MEMORY_TYPE_VALUES } from "../types.js";

interface SimilarityRow extends MemoryRow {
  rowid: number;
  similarity: number;
}

export class MemoryRepository {
  readonly #db: DatabaseManager;
  readonly #embedding: EmbeddingService;

  constructor(db: DatabaseManager, embeddingService: EmbeddingService) {
    this.#db = db;
    this.#embedding = embeddingService;
  }

  async save(options: SaveOptions): Promise<Memory> {
    const { content, type, tags = [], scope = "global", sourceHarness } = options;

    const embedding = await this.#embedding.embed(content);
    const embeddingBlob = Buffer.from(embedding.buffer);

    const top = this.#db.db
      .prepare<[Buffer, string, string], SimilarityRow>(
        `SELECT m.rowid, m.*, (1 - vec_distance_cosine(e.embedding, ?)) AS similarity
         FROM memories m JOIN embeddings e ON e.rowid = m.rowid
         WHERE m.type = ? AND m.scope = ?
         ORDER BY similarity DESC LIMIT 1`
      )
      .get(embeddingBlob, type, scope);

    const now = new Date().toISOString();

    if (top !== undefined && top.similarity > 0.92) {
      this.#db.db
        .prepare(`UPDATE memories SET content = ?, updated_at = ? WHERE id = ?`)
        .run(content, now, top.id);

      this.#db.db
        .prepare(`UPDATE embeddings SET embedding = ? WHERE rowid = ?`)
        .run(embeddingBlob, top.rowid);

      const updated = this.#db.db
        .prepare<[string], MemoryRow>(`SELECT * FROM memories WHERE id = ?`)
        .get(top.id);

      // updated is guaranteed to exist since we just updated it
      return rowToMemory(updated as MemoryRow);
    }

    if (top !== undefined && top.similarity >= 0.75) {
      this.#db.db.prepare(`UPDATE memories SET needs_review = 1 WHERE id = ?`).run(top.id);
    }

    const id = randomUUID();
    this.#db.db
      .prepare(
        `INSERT INTO memories (id, content, type, tags, scope, source, access_count, pinned, needs_review, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`
      )
      .run(id, content, type, JSON.stringify(tags), scope, sourceHarness ?? null, now, now);

    // sqlite-vec v0.1.9 does not accept parameterized rowid on INSERT into vec0 tables.
    // Use a SELECT subquery to copy the rowid from the memories row we just inserted.
    this.#db.db
      .prepare(
        `INSERT INTO embeddings (rowid, embedding) SELECT m.rowid, ? FROM memories m WHERE m.id = ?`
      )
      .run(embeddingBlob, id);

    const row = this.#db.db
      .prepare<[string], MemoryRow>(`SELECT * FROM memories WHERE id = ?`)
      .get(id) as MemoryRow;

    return rowToMemory(row);
  }

  async update(id: string, patch: { content?: string; tags?: string[] }): Promise<Memory> {
    const existing = this.#db.db
      .prepare<[string], MemoryRow & { rowid: number }>(
        `SELECT m.rowid, m.* FROM memories m WHERE m.id = ?`
      )
      .get(id);

    if (existing === undefined) {
      throw new Error(`Memory not found: ${id}`);
    }

    const now = new Date().toISOString();
    const sets: string[] = ["updated_at = ?"];
    const values: string[] = [now];

    if (patch.content !== undefined) {
      sets.push("content = ?");
      values.push(patch.content);
    }

    if (patch.tags !== undefined) {
      sets.push("tags = ?");
      values.push(JSON.stringify(patch.tags));
    }

    values.push(id);
    this.#db.db.prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`).run(...values);

    if (patch.content !== undefined) {
      const embedding = await this.#embedding.embed(patch.content);
      const embeddingBlob = Buffer.from(embedding.buffer);
      this.#db.db
        .prepare(`UPDATE embeddings SET embedding = ? WHERE rowid = ?`)
        .run(embeddingBlob, existing.rowid);
    }

    const updated = this.#db.db
      .prepare<[string], MemoryRow>(`SELECT * FROM memories WHERE id = ?`)
      .get(id) as MemoryRow;

    return rowToMemory(updated);
  }

  delete(id: string): Promise<void> {
    const row = this.#db.db
      .prepare<[string], { rowid: number }>(`SELECT rowid FROM memories WHERE id = ?`)
      .get(id);

    if (row !== undefined) {
      this.#db.db.prepare(`DELETE FROM embeddings WHERE rowid = ?`).run(row.rowid);
    }

    this.#db.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);

    return Promise.resolve();
  }

  list(opts?: { type?: MemoryType; pinned?: boolean }): Memory[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (opts?.type !== undefined) {
      conditions.push("type = ?");
      params.push(opts.type);
    }

    if (opts?.pinned === true) {
      conditions.push("pinned = 1");
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.#db.db
      .prepare<(string | number)[], MemoryRow>(
        `SELECT * FROM memories ${where} ORDER BY created_at DESC`
      )
      .all(...params);

    return rows.map(rowToMemory);
  }

  stats(): { byType: Record<MemoryType, number>; total: number; needsReview: number } {
    const byType = Object.fromEntries(MEMORY_TYPE_VALUES.map((t) => [t, 0])) as Record<
      MemoryType,
      number
    >;

    const typeRows = this.#db.db
      .prepare<[], { type: string; count: number }>(
        `SELECT type, COUNT(*) as count FROM memories GROUP BY type`
      )
      .all();

    for (const row of typeRows) {
      if (row.type in byType) {
        byType[row.type as MemoryType] = row.count;
      }
    }

    const totals = this.#db.db
      .prepare<[], { total: number; needsReview: number }>(
        `SELECT COUNT(*) as total, SUM(needs_review) as needsReview FROM memories`
      )
      .get() ?? { total: 0, needsReview: 0 };

    return {
      byType,
      total: totals.total,
      needsReview: totals.needsReview ?? 0,
    };
  }

  incrementAccessCount(id: string): void {
    this.#db.db.prepare(`UPDATE memories SET access_count = access_count + 1 WHERE id = ?`).run(id);
  }
}
