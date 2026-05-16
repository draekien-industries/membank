import { randomUUID } from "node:crypto";
import type { DatabaseManager } from "../../db/manager.js";
import { rowToMemory, rowToReviewEvent } from "../../persistence/infrastructure/row-types.js";
import { GLOBAL_PROJECT_NAME, GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import type { ProjectRepository } from "../../project/ports.js";
import type { MemoryRow, ReviewEventRow } from "../../schemas.js";
import {
  MEMORY_TYPE_VALUES,
  MemoryPatchSchema,
  MemoryRowSchema,
  MemoryTypeSchema,
  ReviewEventRowSchema,
  TagsJsonSchema,
} from "../../schemas.js";
import type { Memory, MemoryPatch, MemoryType } from "../domain/memory.js";
import type { ReviewEvent } from "../domain/review-event.js";
import type {
  CreateMemoryOpts,
  CreateReviewEventOpts,
  MemoryExportRecord,
  MemoryRepository,
  ReviewQueueStats,
  SimilarMemoryResult,
  StatsResult,
} from "../ports.js";

interface SimilarityRow extends MemoryRow {
  rowid: number;
  similarity: number;
}

export class SqliteMemoryRepository implements MemoryRepository {
  readonly #db: DatabaseManager;
  readonly #projects: ProjectRepository;

  constructor(db: DatabaseManager, projects: ProjectRepository) {
    this.#db = db;
    this.#projects = projects;
  }

  findSimilar(
    embedding: Float32Array,
    type: MemoryType,
    projectHash?: string
  ): SimilarMemoryResult[] {
    const embeddingBlob = Buffer.from(embedding.buffer);

    let row: SimilarityRow | undefined;
    if (projectHash !== undefined) {
      row = this.#db.db
        .prepare<[Buffer, string, string], SimilarityRow>(
          `SELECT m.rowid, m.*, (1 - vec_distance_cosine(e.embedding, ?)) AS similarity
           FROM memories m JOIN embeddings e ON e.rowid = m.rowid
           JOIN memory_projects mp ON mp.memory_id = m.id
           JOIN projects p ON p.id = mp.project_id
           WHERE m.type = ? AND p.scope_hash = ?
           ORDER BY similarity DESC LIMIT 1`
        )
        .get(embeddingBlob, type, projectHash);
    } else {
      row = this.#db.db
        .prepare<[Buffer, string, string], SimilarityRow>(
          `SELECT m.rowid, m.*, (1 - vec_distance_cosine(e.embedding, ?)) AS similarity
           FROM memories m JOIN embeddings e ON e.rowid = m.rowid
           JOIN memory_projects mp ON mp.memory_id = m.id
           JOIN projects p ON p.id = mp.project_id
           WHERE m.type = ? AND p.scope_hash = ?
           ORDER BY similarity DESC LIMIT 1`
        )
        .get(embeddingBlob, type, GLOBAL_SCOPE_HASH);
    }

    return row !== undefined ? [{ id: row.id, similarity: row.similarity }] : [];
  }

  create(opts: CreateMemoryOpts): Memory {
    const { id, content, type, tags, sourceHarness, embedding, projectScope } = opts;
    const now = new Date().toISOString();
    const embeddingBlob = Buffer.from(embedding.buffer);

    this.#db.db
      .prepare(
        `INSERT INTO memories (id, content, type, tags, source, access_count, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`
      )
      .run(id, content, type, JSON.stringify(tags), sourceHarness, now, now);

    this.#db.db
      .prepare(
        `INSERT INTO embeddings (rowid, embedding) SELECT m.rowid, ? FROM memories m WHERE m.id = ?`
      )
      .run(embeddingBlob, id);

    const scope = projectScope ?? { hash: GLOBAL_SCOPE_HASH, name: GLOBAL_PROJECT_NAME };
    const project = this.#projects.upsertByHash(scope.hash, scope.name);
    this.#projects.addAssociation(id, project.id);

    const row = MemoryRowSchema.parse(
      this.#db.db.prepare<[string], unknown>(`SELECT * FROM memories WHERE id = ?`).get(id)
    );

    const projectMap = this.#projects.getProjectsForMemories([id]);
    return rowToMemory(row, projectMap.get(id) ?? []);
  }

  overwrite(id: string, content: string, embedding: Float32Array): Memory {
    const now = new Date().toISOString();
    const embeddingBlob = Buffer.from(embedding.buffer);

    this.#db.db
      .prepare(`UPDATE memories SET content = ?, updated_at = ? WHERE id = ?`)
      .run(content, now, id);

    const rowid = this.#db.db
      .prepare<[string], { rowid: number }>(`SELECT rowid FROM memories WHERE id = ?`)
      .get(id)?.rowid;

    if (rowid !== undefined) {
      this.#db.db
        .prepare(`UPDATE embeddings SET embedding = ? WHERE rowid = ?`)
        .run(embeddingBlob, rowid);
    }

    const updated = MemoryRowSchema.parse(
      this.#db.db.prepare<[string], unknown>(`SELECT * FROM memories WHERE id = ?`).get(id)
    );

    const projectMap = this.#projects.getProjectsForMemories([id]);
    const events = this.#getEventsForMemories([id]);
    return rowToMemory(updated, projectMap.get(id) ?? [], events.get(id) ?? []);
  }

  findById(id: string): Memory | undefined {
    const row = this.#db.db
      .prepare<[string], MemoryRow>(`SELECT * FROM memories WHERE id = ?`)
      .get(id);

    if (row === undefined) return undefined;

    const projectMap = this.#projects.getProjectsForMemories([id]);
    const events = this.#getEventsForMemories([id]);
    return rowToMemory(row, projectMap.get(id) ?? [], events.get(id) ?? []);
  }

  findManyById(ids: string[]): Memory[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.#db.db
      .prepare<string[], MemoryRow>(`SELECT * FROM memories WHERE id IN (${placeholders})`)
      .all(...ids);
    if (rows.length === 0) return [];
    const foundIds = rows.map((r) => r.id);
    const projectMap = this.#projects.getProjectsForMemories(foundIds);
    const eventMap = this.#getEventsForMemories(foundIds);
    return rows.map((row) =>
      rowToMemory(row, projectMap.get(row.id) ?? [], eventMap.get(row.id) ?? [])
    );
  }

  update(id: string, patch: MemoryPatch, embedding?: Float32Array): Memory {
    const { content, tags, type } = MemoryPatchSchema.parse(patch);

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
    const values: (string | number)[] = [now];

    if (content !== undefined) {
      sets.push("content = ?");
      values.push(content);
    }
    if (tags !== undefined) {
      sets.push("tags = ?");
      values.push(JSON.stringify(tags));
    }
    if (type !== undefined) {
      sets.push("type = ?");
      values.push(type);
    }

    values.push(id);
    this.#db.db.prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`).run(...values);

    if (embedding !== undefined) {
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

  delete(id: string): void {
    const row = this.#db.db
      .prepare<[string], { rowid: number }>(`SELECT rowid FROM memories WHERE id = ?`)
      .get(id);

    if (row !== undefined) {
      this.#db.db.prepare(`DELETE FROM embeddings WHERE rowid = ?`).run(row.rowid);
    }

    this.#db.db.prepare(`DELETE FROM memory_projects WHERE memory_id = ?`).run(id);
    this.#db.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
  }

  list(opts?: {
    type?: MemoryType;
    pinned?: boolean;
    needsReview?: boolean;
    projectId?: string;
  }): Memory[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (opts?.type !== undefined) {
      conditions.push("m.type = ?");
      params.push(opts.type);
    }
    if (opts?.pinned === true) {
      conditions.push("m.pinned = 1");
    }
    if (opts?.needsReview === true) {
      conditions.push(
        "EXISTS (SELECT 1 FROM memory_review_events e WHERE e.memory_id = m.id AND e.resolved_at IS NULL)"
      );
    }
    if (opts?.projectId === "global") {
      conditions.push(
        "EXISTS (SELECT 1 FROM memory_projects mp JOIN projects p ON p.id = mp.project_id WHERE mp.memory_id = m.id AND p.scope_hash = ?)"
      );
      params.push(GLOBAL_SCOPE_HASH);
    } else if (opts?.projectId !== undefined) {
      conditions.push("m.id IN (SELECT memory_id FROM memory_projects WHERE project_id = ?)");
      params.push(opts.projectId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.#db.db
      .prepare<(string | number)[], MemoryRow>(
        `SELECT m.* FROM memories m ${where} ORDER BY m.created_at DESC`
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

  listPinnedGlobal(): Memory[] {
    return this.listPinnedForProject(GLOBAL_SCOPE_HASH);
  }

  listPinnedForProject(projectHash: string): Memory[] {
    const rows = this.#db.db
      .prepare<[string], MemoryRow>(
        `SELECT m.* FROM memories m
         JOIN memory_projects mp ON mp.memory_id = m.id
         JOIN projects p ON p.id = mp.project_id
         WHERE p.scope_hash = ? AND m.pinned = 1`
      )
      .all(projectHash);
    return rows.map((row) => rowToMemory(row, []));
  }

  listFlagged(opts?: {
    projectHash?: string;
    limit?: number;
    minSimilarity?: number;
    maxSimilarity?: number;
  }): Memory[] {
    const { projectHash, limit, minSimilarity, maxSimilarity } = opts ?? {};

    const simClauses: string[] = ["e.resolved_at IS NULL"];
    if (minSimilarity !== undefined) simClauses.push("e.similarity >= ?");
    if (maxSimilarity !== undefined) simClauses.push("e.similarity <= ?");
    const simParams = [minSimilarity, maxSimilarity].filter((v) => v !== undefined);

    const existsClause = `EXISTS (
             SELECT 1 FROM memory_review_events e
             WHERE e.memory_id = memories.id AND ${simClauses.join(" AND ")}
           )`;

    const limitClause = limit !== undefined ? "LIMIT ?" : "";
    const limitParams = limit !== undefined ? [limit] : [];

    let rows: MemoryRow[];
    if (projectHash !== undefined) {
      rows = this.#db.db
        .prepare<unknown[], MemoryRow>(
          `SELECT * FROM memories
           WHERE ${existsClause}
           AND ${this.#projectScopeClause()}
           ORDER BY created_at DESC ${limitClause}`
        )
        .all(...simParams, projectHash, ...limitParams);
    } else {
      rows = this.#db.db
        .prepare<unknown[], MemoryRow>(
          `SELECT * FROM memories
           WHERE ${existsClause}
           ORDER BY created_at DESC ${limitClause}`
        )
        .all(...simParams, ...limitParams);
    }

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const projectMap = this.#projects.getProjectsForMemories(ids);
    const eventMap = this.#getEventsForMemories(ids, { unresolvedOnly: true });
    return rows.map((row) =>
      rowToMemory(row, projectMap.get(row.id) ?? [], eventMap.get(row.id) ?? [])
    );
  }

  listReviewEdges(projectHash?: string): Array<{ memoryId: string; conflictingMemoryId: string }> {
    interface EdgeRow {
      memory_id: string;
      conflicting_memory_id: string;
    }
    if (projectHash !== undefined) {
      const rows = this.#db.db
        .prepare<[string], EdgeRow>(
          `SELECT e.memory_id, e.conflicting_memory_id
           FROM memory_review_events e
           JOIN memories m ON m.id = e.memory_id
           WHERE e.resolved_at IS NULL
             AND e.conflicting_memory_id IS NOT NULL
             AND ${this.#projectScopeClause("m")}`
        )
        .all(projectHash);
      return rows.map((r) => ({
        memoryId: r.memory_id,
        conflictingMemoryId: r.conflicting_memory_id,
      }));
    }
    const rows = this.#db.db
      .prepare<[], EdgeRow>(
        `SELECT memory_id, conflicting_memory_id FROM memory_review_events
         WHERE resolved_at IS NULL AND conflicting_memory_id IS NOT NULL`
      )
      .all();
    return rows.map((r) => ({
      memoryId: r.memory_id,
      conflictingMemoryId: r.conflicting_memory_id,
    }));
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

  createReviewEvent(opts: CreateReviewEventOpts): void {
    const now = new Date().toISOString();
    this.#db.db
      .prepare(
        `INSERT INTO memory_review_events
           (id, memory_id, conflicting_memory_id, similarity, conflict_content_snapshot, reason, created_at)
         VALUES (?, ?, ?, ?, ?, 'similarity_dedup', ?)`
      )
      .run(
        randomUUID(),
        opts.memoryId,
        opts.conflictingMemoryId,
        opts.similarity,
        opts.conflictContentSnapshot,
        now
      );
  }

  resolveReviewEvents(memoryId: string): void {
    const now = new Date().toISOString();
    this.#db.db
      .prepare(
        `UPDATE memory_review_events SET resolved_at = ? WHERE memory_id = ? AND resolved_at IS NULL`
      )
      .run(now, memoryId);
  }

  getPinnedCharCount(projectHash?: string): number {
    if (projectHash !== undefined) {
      const row = this.#db.db
        .prepare<[string], { total: number }>(
          `SELECT COALESCE(SUM(LENGTH(content)), 0) as total FROM memories
           WHERE pinned = 1 AND ${this.#projectScopeClause()}`
        )
        .get(projectHash) ?? { total: 0 };
      return row.total;
    }
    const row = this.#db.db
      .prepare<[], { total: number }>(
        `SELECT COALESCE(SUM(LENGTH(content)), 0) as total FROM memories WHERE pinned = 1`
      )
      .get() ?? { total: 0 };
    return row.total;
  }

  stats(projectHash?: string): StatsResult {
    const byType = Object.fromEntries(MEMORY_TYPE_VALUES.map((t) => [t, 0])) as Record<
      MemoryType,
      number
    >;

    if (projectHash !== undefined) {
      const typeRows = this.#db.db
        .prepare<[string], { type: string; count: number }>(
          `SELECT type, COUNT(*) as count FROM memories
           WHERE ${this.#projectScopeClause()}
           GROUP BY type`
        )
        .all(projectHash);

      for (const row of typeRows) {
        const parsed = MemoryTypeSchema.safeParse(row.type);
        if (parsed.success) byType[parsed.data] = row.count;
      }

      const aggregates = this.#db.db
        .prepare<[string], { total: number; pinned: number | null; pinBudgetChars: number }>(
          `SELECT COUNT(*) as total, SUM(pinned) as pinned,
           COALESCE(SUM(CASE WHEN pinned = 1 THEN LENGTH(content) ELSE 0 END), 0) as pinBudgetChars
           FROM memories WHERE ${this.#projectScopeClause()}`
        )
        .get(projectHash) ?? { total: 0, pinned: 0, pinBudgetChars: 0 };

      const reviewRow = this.#db.db
        .prepare<[string], { needsReview: number }>(
          `SELECT COUNT(DISTINCT e.memory_id) as needsReview
           FROM memory_review_events e
           JOIN memories m ON m.id = e.memory_id
           WHERE e.resolved_at IS NULL
           AND ${this.#projectScopeClause("m")}`
        )
        .get(projectHash) ?? { needsReview: 0 };

      return {
        byType,
        total: aggregates.total,
        pinned: aggregates.pinned ?? 0,
        needsReview: reviewRow.needsReview,
        pinBudgetChars: aggregates.pinBudgetChars,
      };
    }

    const typeRows = this.#db.db
      .prepare<[], { type: string; count: number }>(
        `SELECT type, COUNT(*) as count FROM memories GROUP BY type`
      )
      .all();

    for (const row of typeRows) {
      const parsed = MemoryTypeSchema.safeParse(row.type);
      if (parsed.success) byType[parsed.data] = row.count;
    }

    const aggregates = this.#db.db
      .prepare<[], { total: number; pinned: number | null }>(
        `SELECT COUNT(*) as total, SUM(pinned) as pinned FROM memories`
      )
      .get() ?? { total: 0, pinned: 0 };

    const reviewRow = this.#db.db
      .prepare<[], { needsReview: number }>(
        `SELECT COUNT(DISTINCT memory_id) as needsReview FROM memory_review_events WHERE resolved_at IS NULL`
      )
      .get() ?? { needsReview: 0 };

    return {
      byType,
      total: aggregates.total,
      pinned: aggregates.pinned ?? 0,
      needsReview: reviewRow.needsReview,
      pinBudgetChars: this.getPinnedCharCount(),
    };
  }

  reviewQueueStats(projectHash?: string): Omit<ReviewQueueStats, "clusters"> {
    interface BandRow {
      band: string;
      count: number;
    }
    interface TypeRow {
      type: string;
      count: number;
    }
    interface PairsRow {
      pairs: number;
    }

    const scopeJoin =
      projectHash !== undefined
        ? `JOIN memories m ON m.id = e.memory_id
           WHERE e.resolved_at IS NULL AND ${this.#projectScopeClause("m")}`
        : "JOIN memories m ON m.id = e.memory_id WHERE e.resolved_at IS NULL";

    const params: string[] = projectHash !== undefined ? [projectHash] : [];

    const bandRows = this.#db.db
      .prepare<string[], BandRow>(
        `SELECT
           CASE
             WHEN e.similarity >= 0.85 THEN 'high'
             WHEN e.similarity >= 0.80 THEN 'mid'
             ELSE 'low'
           END AS band,
           COUNT(DISTINCT e.memory_id) AS count
         FROM memory_review_events e ${scopeJoin}
         GROUP BY band`
      )
      .all(...params);

    const typeRows = this.#db.db
      .prepare<string[], TypeRow>(
        `SELECT m.type, COUNT(DISTINCT e.memory_id) AS count
         FROM memory_review_events e ${scopeJoin}
         GROUP BY m.type`
      )
      .all(...params);

    const pairsRow = this.#db.db
      .prepare<string[], PairsRow>(
        `SELECT COUNT(*) AS pairs FROM memory_review_events e ${scopeJoin}`
      )
      .get(...params) ?? { pairs: 0 };

    const byBand = { high: 0, mid: 0, low: 0 };
    for (const row of bandRows) {
      if (row.band === "high" || row.band === "mid" || row.band === "low") {
        byBand[row.band] = row.count;
      }
    }

    const byType: Partial<Record<MemoryType, number>> = {};
    for (const row of typeRows) {
      const parsed = MemoryTypeSchema.safeParse(row.type);
      if (parsed.success) byType[parsed.data] = row.count;
    }

    return { pairs: pairsRow.pairs, byBand, byType };
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

  exportAll(): MemoryExportRecord[] {
    interface ExportRow extends MemoryRow {
      embedding: Buffer | null;
    }
    const rows = this.#db.db
      .prepare<[], ExportRow>(
        `SELECT m.*, e.embedding FROM memories m LEFT JOIN embeddings e ON e.rowid = m.rowid ORDER BY m.created_at DESC`
      )
      .all();
    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      type: MemoryTypeSchema.parse(row.type),
      tags: TagsJsonSchema.parse(JSON.parse(row.tags)),
      sourceHarness: row.source,
      accessCount: row.access_count,
      pinned: row.pinned !== 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      embedding:
        row.embedding !== null
          ? new Float32Array(
              row.embedding.buffer,
              row.embedding.byteOffset,
              row.embedding.byteLength / 4
            )
          : null,
    }));
  }

  importAll(records: MemoryExportRecord[]): void {
    const insertMemory = this.#db.db.prepare(
      `INSERT OR REPLACE INTO memories (id, content, type, tags, source, access_count, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertEmbedding = this.#db.db.prepare(
      `INSERT OR REPLACE INTO embeddings (rowid, embedding) SELECT m.rowid, ? FROM memories m WHERE m.id = ?`
    );
    this.#db.db.transaction(() => {
      for (const rec of records) {
        insertMemory.run(
          rec.id,
          rec.content,
          rec.type,
          JSON.stringify(rec.tags),
          rec.sourceHarness,
          rec.accessCount,
          rec.pinned ? 1 : 0,
          rec.createdAt,
          rec.updatedAt
        );
        if (rec.embedding !== null) {
          insertEmbedding.run(
            Buffer.from(rec.embedding.buffer, rec.embedding.byteOffset, rec.embedding.byteLength),
            rec.id
          );
        }
      }
    })();
  }

  #projectScopeClause(tableAlias = "memories"): string {
    return `EXISTS (
      SELECT 1 FROM memory_projects mp JOIN projects p ON p.id = mp.project_id
      WHERE mp.memory_id = ${tableAlias}.id AND (p.scope_hash = ? OR p.scope_hash = '${GLOBAL_SCOPE_HASH}')
    )`;
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
}

export function createMemoryRepository(
  db: DatabaseManager,
  projects: ProjectRepository
): MemoryRepository {
  return new SqliteMemoryRepository(db, projects);
}
