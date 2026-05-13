import { randomUUID } from "node:crypto";
import type { DatabaseManager } from "../../db/manager.js";
import { rowToMemory, rowToReviewEvent } from "../../persistence/infrastructure/row-types.js";
import type { ProjectRepository } from "../../project/ports.js";
import type { MemoryRow, ReviewEventRow } from "../../schemas.js";
import {
  MEMORY_TYPE_VALUES,
  MemoryPatchSchema,
  MemoryRowSchema,
  MemoryTypeSchema,
  ReviewEventRowSchema,
} from "../../schemas.js";
import type { Memory, MemoryPatch, MemoryType } from "../domain/memory.js";
import type { ReviewEvent } from "../domain/review-event.js";
import type {
  CreateMemoryOpts,
  CreateReviewEventOpts,
  MemoryRepository,
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
        .prepare<[Buffer, string], SimilarityRow>(
          `SELECT m.rowid, m.*, (1 - vec_distance_cosine(e.embedding, ?)) AS similarity
           FROM memories m JOIN embeddings e ON e.rowid = m.rowid
           WHERE m.type = ?
           AND m.id NOT IN (SELECT memory_id FROM memory_projects)
           ORDER BY similarity DESC LIMIT 1`
        )
        .get(embeddingBlob, type);
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

    if (projectScope !== undefined) {
      const project = this.#projects.upsertByHash(projectScope.hash, projectScope.name);
      this.#projects.addAssociation(id, project.id);
    }

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
      conditions.push("m.id NOT IN (SELECT memory_id FROM memory_projects)");
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
    const rows = this.#db.db
      .prepare<[], MemoryRow>(
        `SELECT * FROM memories
         WHERE id NOT IN (SELECT memory_id FROM memory_projects)
         AND pinned = 1`
      )
      .all();
    return rows.map((row) => rowToMemory(row, []));
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

  getPinnedCharCount(): number {
    const row = this.#db.db
      .prepare<[], { total: number }>(
        `SELECT COALESCE(SUM(LENGTH(content)), 0) as total FROM memories WHERE pinned = 1`
      )
      .get() ?? { total: 0 };
    return row.total;
  }

  stats(): StatsResult {
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
