import { randomUUID } from "node:crypto";
import type { DatabaseManager } from "../db/manager.js";
import type { MemoryRow } from "../db/row-types.js";
import { rowToMemory } from "../db/row-types.js";
import type { EmbeddingService } from "../embedding/service.js";
import type { ProjectRepository } from "../project/repository.js";
import type { Memory, MemoryType, SaveOptions } from "../types.js";
import { MEMORY_TYPE_VALUES } from "../types.js";

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
    const { content, type, tags = [], projectHash, sourceHarness } = options;

    const embedding = await this.#embedding.embed(content);
    const embeddingBlob = Buffer.from(embedding.buffer);

    // Dedup: find similar memory in same context
    let top: SimilarityRow | undefined;
    if (projectHash !== undefined) {
      top = this.#db.db
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

      const updated = this.#db.db
        .prepare<[string], MemoryRow>(`SELECT * FROM memories WHERE id = ?`)
        .get(top.id) as MemoryRow;

      const projectMap = this.#projects.getProjectsForMemories([top.id]);
      return rowToMemory(updated, projectMap.get(top.id) ?? []);
    }

    if (top !== undefined && top.similarity >= 0.75) {
      this.#db.db.prepare(`UPDATE memories SET needs_review = 1 WHERE id = ?`).run(top.id);
    }

    const id = randomUUID();
    this.#db.db
      .prepare(
        `INSERT INTO memories (id, content, type, tags, source, access_count, pinned, needs_review, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`
      )
      .run(id, content, type, JSON.stringify(tags), sourceHarness ?? null, now, now);

    this.#db.db
      .prepare(
        `INSERT INTO embeddings (rowid, embedding) SELECT m.rowid, ? FROM memories m WHERE m.id = ?`
      )
      .run(embeddingBlob, id);

    if (projectHash !== undefined) {
      // resolveProject name not available here; caller should have upserted already
      // if project not yet upserted (e.g. CLI path), upsert with hash as placeholder name
      const project = this.#projects.upsertByHash(
        projectHash,
        `project-${projectHash.slice(0, 8)}`
      );
      this.#projects.addAssociation(id, project.id);
    }

    const row = this.#db.db
      .prepare<[string], MemoryRow>(`SELECT * FROM memories WHERE id = ?`)
      .get(id) as MemoryRow;

    const projectMap = this.#projects.getProjectsForMemories([id]);
    return rowToMemory(row, projectMap.get(id) ?? []);
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

    const projectMap = this.#projects.getProjectsForMemories([id]);
    return rowToMemory(updated, projectMap.get(id) ?? []);
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
    return rows.map((row) => rowToMemory(row, projectMap.get(row.id) ?? []));
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

    const updated = this.#db.db
      .prepare<[string], MemoryRow>(`SELECT * FROM memories WHERE id = ?`)
      .get(id) as MemoryRow;

    const projectMap = this.#projects.getProjectsForMemories([id]);
    return rowToMemory(updated, projectMap.get(id) ?? []);
  }

  incrementAccessCount(id: string): void {
    this.#db.db.prepare(`UPDATE memories SET access_count = access_count + 1 WHERE id = ?`).run(id);
  }
}
