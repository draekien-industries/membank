import type { DatabaseManager } from "../db/manager.js";
import { rowToMemory } from "../db/row-types.js";
import { MEMORY_TYPE_VALUES, MemoryTypeSchema } from "../schemas.js";
import type { MemoryRow, MemoryType, SessionContext } from "../types.js";

interface TypeCountRow {
  type: string;
  count: number;
}

export function listMemoryTypes(): MemoryType[] {
  return [...MEMORY_TYPE_VALUES];
}

export class SessionContextBuilder {
  readonly #db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.#db = db;
  }

  getSessionContext(projectHash: string): SessionContext {
    const pinnedGlobal = this.#db.db
      .prepare<[], MemoryRow>(
        `SELECT * FROM memories
         WHERE id NOT IN (SELECT memory_id FROM memory_projects)
         AND pinned = 1`
      )
      .all()
      .map((row) => rowToMemory(row, []));

    const pinnedProject = this.#db.db
      .prepare<[string], MemoryRow>(
        `SELECT m.* FROM memories m
         JOIN memory_projects mp ON mp.memory_id = m.id
         JOIN projects p ON p.id = mp.project_id
         WHERE p.scope_hash = ? AND m.pinned = 1`
      )
      .all(projectHash)
      .map((row) => rowToMemory(row, []));

    const typeCounts = this.#db.db
      .prepare<[], TypeCountRow>("SELECT type, COUNT(*) as count FROM memories GROUP BY type")
      .all();

    const stats = Object.fromEntries(MEMORY_TYPE_VALUES.map((t) => [t, 0])) as Record<
      MemoryType,
      number
    >;
    for (const row of typeCounts) {
      const parsed = MemoryTypeSchema.safeParse(row.type);
      if (parsed.success) {
        stats[parsed.data] = row.count;
      }
    }

    return { stats, pinnedGlobal, pinnedProject };
  }
}
