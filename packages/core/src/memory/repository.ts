import { randomUUID } from "node:crypto";
import type { DatabaseManager } from "../db/manager.js";
import type { EmbeddingService } from "../embedding/service.js";
import type { Memory, MemoryType, SaveOptions } from "../types.js";

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
}

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
      // Overwrite existing record
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
      return this.#rowToMemory(updated as MemoryRow);
    }

    if (top !== undefined && top.similarity >= 0.75) {
      // Flag existing as needs_review
      this.#db.db.prepare(`UPDATE memories SET needs_review = 1 WHERE id = ?`).run(top.id);
    }

    // Insert new record
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

    return this.#rowToMemory(row);
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

    return this.#rowToMemory(updated);
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

  incrementAccessCount(id: string): void {
    this.#db.db.prepare(`UPDATE memories SET access_count = access_count + 1 WHERE id = ?`).run(id);
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
