import { randomUUID } from "node:crypto";
import type { DatabaseManager } from "../../db/manager.js";
import { rowToProject } from "../../persistence/infrastructure/row-types.js";
import type { Project, ProjectRow } from "../../schemas.js";
import { ProjectRowSchema } from "../../schemas.js";
import {
  GLOBAL_PROJECT_ID,
  GLOBAL_PROJECT_NAME,
  GLOBAL_SCOPE_HASH,
} from "../domain/global-scope.js";
import type { ProjectRepository } from "../ports.js";

interface ProjectMemoryRow extends ProjectRow {
  memory_id: string;
}

export class SqliteProjectRepository implements ProjectRepository {
  readonly #db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.#db = db;
  }

  upsertByHash(hash: string, name: string, origin?: string): Project {
    if (!/^[0-9a-f]{16}$/.test(hash)) {
      throw new Error(`Invalid scope hash "${hash}": expected 16 lowercase hex characters`);
    }
    const now = new Date().toISOString();
    const id = hash === GLOBAL_SCOPE_HASH ? GLOBAL_PROJECT_ID : randomUUID();
    const resolvedName = hash === GLOBAL_SCOPE_HASH ? GLOBAL_PROJECT_NAME : name;
    this.#db.db
      .prepare(
        `INSERT INTO projects (id, name, scope_hash, origin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(scope_hash) DO UPDATE SET origin = COALESCE(origin, excluded.origin)`
      )
      .run(id, resolvedName, hash, origin ?? null, now, now);

    const row = ProjectRowSchema.parse(
      this.#db.db
        .prepare<[string], unknown>(`SELECT * FROM projects WHERE scope_hash = ?`)
        .get(hash)
    );

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

  getById(id: string): Project | undefined {
    const row = this.#db.db
      .prepare<[string], ProjectRow>(`SELECT * FROM projects WHERE id = ?`)
      .get(id);
    return row !== undefined ? rowToProject(row) : undefined;
  }

  getByHash(hash: string): Project | undefined {
    const row = this.#db.db
      .prepare<[string], ProjectRow>(`SELECT * FROM projects WHERE scope_hash = ?`)
      .get(hash);
    return row !== undefined ? rowToProject(row) : undefined;
  }

  getByName(name: string): Project | undefined {
    const row = this.#db.db
      .prepare<[string], ProjectRow>(`SELECT * FROM projects WHERE name = ? LIMIT 1`)
      .get(name);
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

  merge(sourceId: string, targetId: string): { movedMemories: number } {
    if (sourceId === targetId) {
      throw new Error("Cannot merge a project into itself");
    }
    if (sourceId === GLOBAL_PROJECT_ID) {
      throw new Error("Cannot merge away the global project");
    }
    const source = this.#db.db
      .prepare<[string], ProjectRow>(`SELECT * FROM projects WHERE id = ?`)
      .get(sourceId);
    const target = this.#db.db
      .prepare<[string], ProjectRow>(`SELECT * FROM projects WHERE id = ?`)
      .get(targetId);
    if (source === undefined) throw new Error(`Project not found: ${sourceId}`);
    if (target === undefined) throw new Error(`Project not found: ${targetId}`);

    return this.#db.db.transaction(() => {
      const movedMemories = this.countMemories(sourceId);

      this.#db.db
        .prepare(
          `INSERT OR IGNORE INTO memory_projects (memory_id, project_id)
           SELECT memory_id, ? FROM memory_projects WHERE project_id = ?`
        )
        .run(targetId, sourceId);

      this.#db.db
        .prepare(`UPDATE activity_events SET project_hash = ? WHERE project_hash = ?`)
        .run(target.scope_hash, source.scope_hash);

      this.deleteById(sourceId);

      return { movedMemories };
    })();
  }

  listExclusiveMemoryIds(projectId: string): string[] {
    return this.#db.db
      .prepare<[string, string], { memory_id: string }>(
        `SELECT memory_id FROM memory_projects
         WHERE project_id = ?
           AND memory_id NOT IN (SELECT memory_id FROM memory_projects WHERE project_id != ?)`
      )
      .all(projectId, projectId)
      .map((row) => row.memory_id);
  }

  deleteById(id: string): void {
    if (id === GLOBAL_PROJECT_ID) {
      throw new Error("Cannot delete the global project");
    }
    this.#db.db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  }
}

export function createProjectRepository(db: DatabaseManager): ProjectRepository {
  return new SqliteProjectRepository(db);
}
