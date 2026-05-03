import { randomUUID } from "node:crypto";
import type { DatabaseManager } from "../db/manager.js";
import type { ProjectRow } from "../db/row-types.js";
import { rowToProject } from "../db/row-types.js";
import type { Project } from "../types.js";

interface ProjectMemoryRow extends ProjectRow {
  memory_id: string;
}

export class ProjectRepository {
  readonly #db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.#db = db;
  }

  upsertByHash(hash: string, name: string): Project {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.#db.db
      .prepare(
        `INSERT OR IGNORE INTO projects (id, name, scope_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, name, hash, now, now);

    const row = this.#db.db
      .prepare<[string], ProjectRow>(`SELECT * FROM projects WHERE scope_hash = ?`)
      .get(hash) as ProjectRow;

    return rowToProject(row);
  }

  rename(id: string, name: string): Project {
    const now = new Date().toISOString();
    this.#db.db
      .prepare(`UPDATE projects SET name = ?, updated_at = ? WHERE id = ?`)
      .run(name, now, id);

    const row = this.#db.db
      .prepare<[string], ProjectRow>(`SELECT * FROM projects WHERE id = ?`)
      .get(id);

    if (row === undefined) throw new Error(`Project not found: ${id}`);
    return rowToProject(row);
  }

  list(): Project[] {
    return this.#db.db
      .prepare<[], ProjectRow>(`SELECT * FROM projects ORDER BY name ASC`)
      .all()
      .map(rowToProject);
  }

  getByHash(hash: string): Project | undefined {
    const row = this.#db.db
      .prepare<[string], ProjectRow>(`SELECT * FROM projects WHERE scope_hash = ?`)
      .get(hash);
    return row !== undefined ? rowToProject(row) : undefined;
  }

  addAssociation(memoryId: string, projectId: string): void {
    this.#db.db
      .prepare(`INSERT OR IGNORE INTO memory_projects (memory_id, project_id) VALUES (?, ?)`)
      .run(memoryId, projectId);
  }

  removeAssociation(memoryId: string, projectId: string): void {
    this.#db.db
      .prepare(`DELETE FROM memory_projects WHERE memory_id = ? AND project_id = ?`)
      .run(memoryId, projectId);
  }

  countMemories(projectId: string): number {
    const row = this.#db.db
      .prepare<[string], { count: number }>(
        `SELECT COUNT(*) AS count FROM memory_projects WHERE project_id = ?`
      )
      .get(projectId);
    return row?.count ?? 0;
  }

  getProjectsForMemories(memoryIds: string[]): Map<string, Project[]> {
    if (memoryIds.length === 0) return new Map();
    const placeholders = memoryIds.map(() => "?").join(",");
    const rows = this.#db.db
      .prepare<string[], ProjectMemoryRow>(
        `SELECT p.*, mp.memory_id FROM projects p
         JOIN memory_projects mp ON mp.project_id = p.id
         WHERE mp.memory_id IN (${placeholders})`
      )
      .all(...memoryIds);

    const result = new Map<string, Project[]>();
    for (const row of rows) {
      const list = result.get(row.memory_id) ?? [];
      list.push(rowToProject(row));
      result.set(row.memory_id, list);
    }
    return result;
  }
}
