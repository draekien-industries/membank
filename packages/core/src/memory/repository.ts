import { randomUUID } from "node:crypto";
import type { DatabaseManager } from "../db/manager.js";
import { rowToMemory, rowToReviewEvent } from "../db/row-types.js";
import type { EmbeddingService } from "../embedding/service.js";
import type { ProjectRepository } from "../project/repository.js";
import {
  MEMORY_TYPE_VALUES,
  MemoryPatchSchema,
  MemoryRowSchema,
  MemoryTypeSchema,
  ReviewEventRowSchema,
  SaveOptionsSchema,
} from "../schemas.js";
import type {
  Memory,
  MemoryPatch,
  MemoryRow,
  MemoryType,
  ReviewEvent,
  ReviewEventRow,
  SaveOptions,
} from "../types.js";

interface SimilarityRow extends MemoryRow {
  rowid: number;
  similarity: number;
}

export class MemoryRepository {
  readonly #db: DatabaseManager;
  readonly #embedding: EmbeddingService;
  readonly #projects: ProjectRepository;

  constructor(
    db: DatabaseManager,
    embeddingService: EmbeddingService,
    projects: ProjectRepository
  ) {
    this.#db = db;
    this.#embedding = embeddingService;
    this.#projects = projects;
  }

  async save(options: SaveOptions): Promise<Memory> {
    const {
      content,
      type,
      tags = [],
      projectScope,
      sourceHarness,
    } = SaveOptionsSchema.parse(options);

    const embedding = await this.#embedding.embed(content);
    const embeddingBlob = Buffer.from(embedding.buffer);

    // Dedup: find similar memory in same context
    let top: SimilarityRow | undefined;
    if (projectScope !== undefined) {
      top = this.#db.db
        .prepare<[Buffer, string, string], SimilarityRow>(
          `SELECT m.rowid, m.*, (1 - vec_distance_cosine(e.embedding, ?)) AS similarity
           FROM memories m JOIN embeddings e ON e.rowid = m.rowid
           JOIN memory_projects mp ON mp.memory_id = m.id
           JOIN projects p ON p.id = mp.project_id
           WHERE m.type = ? AND p.scope_hash = ?
           ORDER BY similarity DESC LIMIT 1`
        )
        .get(embeddingBlob, type, projectScope.hash);
    } else {
      top = this.#db.db
        .prepare<[Buffer, string], SimilarityRow>(
          `SELECT m.rowid, m.*, (1 - vec_distance_cosine(e.embedding, ?)) AS similarity
           FROM memories m JOIN embeddings e ON e.rowid = m.rowid
           WHERE m.type = ?
           AND m.id NOT IN (SELECT memory_id FROM memory_projects)
           ORDER BY similarity DESC LIMIT 1`
        )
        .get(embeddingBlob, type);
    }

    const now = new Date().toISOString();

    if (top !== undefined && top.similarity > 0.92) {
      this.#db.db
        .prepare(`UPDATE memories SET content = ?, updated_at = ? WHERE id = ?`)
        .run(content, now, top.id);
      this.#db.db
        .prepare(`UPDATE embeddings SET embedding = ? WHERE rowid = ?`)
        .run(embeddingBlob, top.rowid);

      const updated = MemoryRowSchema.parse(
        this.#db.db.prepare<[string], unknown>(`SELECT * FROM memories WHERE id = ?`).get(top.id)
      );

      const projectMap = this.#projects.getProjectsForMemories([top.id]);
      const events = this.#getEventsForMemories([top.id]);
      return rowToMemory(updated, projectMap.get(top.id) ?? [], events.get(top.id) ?? []);
    }

    const id = randomUUID();

    this.#db.db
      .prepare(
        `INSERT INTO memories (id, content, type, tags, source, access_count, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`
      )
      .run(id, content, type, JSON.stringify(tags), sourceHarness ?? null, now, now);

    if (top !== undefined && top.similarity >= 0.75) {
      this.#db.db
        .prepare(
          `INSERT INTO memory_review_events
             (id, memory_id, conflicting_memory_id, similarity, conflict_content_snapshot, reason, created_at)
           VALUES (?, ?, ?, ?, ?, 'similarity_dedup', ?)`
        )
        .run(randomUUID(), top.id, id, top.similarity, content, now);
    }

    this.#db.db
      .prepare(
        `INSERT INTO embeddings (rowid, embedding) SELECT m.rowid, ? FROM memories m WHERE m.id = ?`
      )
      .run(embeddingBlob, id);

    if (projectScope !== undefined) {
      const project = this.#projects.upsertByHash(projectScope.hash, projectScope.name);
      this.#projects.addAssociation(id, project.id);
    }

    const row = MemoryRowSchema.parse(
      this.#db.db.prepare<[string], unknown>(`SELECT * FROM memories WHERE id = ?`).get(id)
    );

    const projectMap = this.#projects.getProjectsForMemories([id]);
    return rowToMemory(row, projectMap.get(id) ?? [], []);
  }

  async update(id: string, patch: MemoryPatch): Promise<Memory> {
    const { content, tags } = MemoryPatchSchema.parse(patch);

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

    if (content !== undefined) {
      sets.push("content = ?");
      values.push(content);
    }

    if (tags !== undefined) {
      sets.push("tags = ?");
      values.push(JSON.stringify(tags));
    }

    values.push(id);
    this.#db.db.prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`).run(...values);

    if (content !== undefined) {
      const embedding = await this.#embedding.embed(content);
      const embeddingBlob = Buffer.from(embedding.buffer);
      this.#db.db
        .prepare(`UPDATE embeddings SET embedding = ? WHERE rowid = ?`)
        .run(embeddingBlob, existing.rowid);
    }

    const updated = MemoryRowSchema.parse(
      this.#db.db.prepare<[string], unknown>(`SELECT * FROM memories WHERE id = ?`).get(id)
    );

    const projectMap = this.#projects.getProjectsForMemories([id]);
    const events = this.#getEventsForMemories([id]);
    return rowToMemory(updated, projectMap.get(id) ?? [], events.get(id) ?? []);
  }

  delete(id: string): Promise<void> {
    const row = this.#db.db
      .prepare<[string], { rowid: number }>(`SELECT rowid FROM memories WHERE id = ?`)
      .get(id);

    if (row !== undefined) {
      this.#db.db.prepare(`DELETE FROM embeddings WHERE rowid = ?`).run(row.rowid);
    }

    this.#db.db.prepare(`DELETE FROM memory_projects WHERE memory_id = ?`).run(id);
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

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const projectMap = this.#projects.getProjectsForMemories(ids);
    const eventMap = this.#getEventsForMemories(ids);
    return rows.map((row) =>
      rowToMemory(row, projectMap.get(row.id) ?? [], eventMap.get(row.id) ?? [])
    );
  }

  listFlagged(): Memory[] {
    const rows = this.#db.db
      .prepare<[], MemoryRow>(
        `SELECT * FROM memories
         WHERE EXISTS (
           SELECT 1 FROM memory_review_events e
           WHERE e.memory_id = memories.id AND e.resolved_at IS NULL
         )
         ORDER BY created_at DESC`
      )
      .all();

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const projectMap = this.#projects.getProjectsForMemories(ids);
    const eventMap = this.#getEventsForMemories(ids, { unresolvedOnly: true });
    return rows.map((row) =>
      rowToMemory(row, projectMap.get(row.id) ?? [], eventMap.get(row.id) ?? [])
    );
  }

  listReviewEvents(memoryId: string, opts?: { unresolvedOnly?: boolean }): ReviewEvent[] {
    const where =
      opts?.unresolvedOnly === true
        ? "WHERE memory_id = ? AND resolved_at IS NULL"
        : "WHERE memory_id = ?";

    const rows = this.#db.db
      .prepare<[string], ReviewEventRow>(
        `SELECT * FROM memory_review_events ${where} ORDER BY created_at DESC`
      )
      .all(memoryId);

    return rows.map((r) => rowToReviewEvent(ReviewEventRowSchema.parse(r)));
  }

  resolveReviewEvents(memoryId: string): void {
    const now = new Date().toISOString();
    this.#db.db
      .prepare(
        `UPDATE memory_review_events SET resolved_at = ? WHERE memory_id = ? AND resolved_at IS NULL`
      )
      .run(now, memoryId);
  }

  #getEventsForMemories(
    ids: string[],
    opts?: { unresolvedOnly?: boolean }
  ): Map<string, ReviewEvent[]> {
    if (ids.length === 0) return new Map();

    const placeholders = ids.map(() => "?").join(", ");
    const unresolvedClause = opts?.unresolvedOnly === true ? "AND resolved_at IS NULL" : "";
    const rows = this.#db.db
      .prepare<string[], ReviewEventRow>(
        `SELECT * FROM memory_review_events
         WHERE memory_id IN (${placeholders}) ${unresolvedClause}
         ORDER BY created_at DESC`
      )
      .all(...ids);

    const map = new Map<string, ReviewEvent[]>();
    for (const row of rows) {
      const event = rowToReviewEvent(ReviewEventRowSchema.parse(row));
      const existing = map.get(event.memoryId) ?? [];
      existing.push(event);
      map.set(event.memoryId, existing);
    }
    return map;
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
      const parsed = MemoryTypeSchema.safeParse(row.type);
      if (parsed.success) {
        byType[parsed.data] = row.count;
      }
    }

    const totals = this.#db.db
      .prepare<[], { total: number }>(`SELECT COUNT(*) as total FROM memories`)
      .get() ?? { total: 0 };

    const reviewRow = this.#db.db
      .prepare<[], { needsReview: number }>(
        `SELECT COUNT(DISTINCT memory_id) as needsReview FROM memory_review_events WHERE resolved_at IS NULL`
      )
      .get() ?? { needsReview: 0 };

    return {
      byType,
      total: totals.total,
      needsReview: reviewRow.needsReview,
    };
  }

  setPin(id: string, pinned: boolean): Memory {
    const existing = this.#db.db
      .prepare<[string], MemoryRow>(`SELECT * FROM memories WHERE id = ?`)
      .get(id);

    if (existing === undefined) {
      throw new Error(`Memory not found: ${id}`);
    }

    const now = new Date().toISOString();
    this.#db.db
      .prepare(`UPDATE memories SET pinned = ?, updated_at = ? WHERE id = ?`)
      .run(pinned ? 1 : 0, now, id);

    const updated = MemoryRowSchema.parse(
      this.#db.db.prepare<[string], unknown>(`SELECT * FROM memories WHERE id = ?`).get(id)
    );

    const projectMap = this.#projects.getProjectsForMemories([id]);
    const events = this.#getEventsForMemories([id]);
    return rowToMemory(updated, projectMap.get(id) ?? [], events.get(id) ?? []);
  }

  incrementAccessCount(id: string): void {
    this.#db.db.prepare(`UPDATE memories SET access_count = access_count + 1 WHERE id = ?`).run(id);
  }
}
