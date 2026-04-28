import type { DatabaseManager } from "../db/manager.js";
import type { MemoryRow } from "../db/row-types.js";
import { rowToMemory } from "../db/row-types.js";
import type { MemoryType, SessionContext } from "../types.js";
import { MEMORY_TYPE_VALUES } from "../types.js";

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

  getSessionContext(projectScope: string): SessionContext {
    const pinnedGlobal = this.#db.db
      .prepare<[], MemoryRow>("SELECT * FROM memories WHERE scope = 'global' AND pinned = 1")
      .all()
      .map(rowToMemory);

    const pinnedProject = this.#db.db
      .prepare<[string], MemoryRow>("SELECT * FROM memories WHERE scope = ? AND pinned = 1")
      .all(projectScope)
      .map(rowToMemory);

    const typeCounts = this.#db.db
      .prepare<[], TypeCountRow>("SELECT type, COUNT(*) as count FROM memories GROUP BY type")
      .all();

    const stats = Object.fromEntries(MEMORY_TYPE_VALUES.map((t) => [t, 0])) as Record<
      MemoryType,
      number
    >;
    for (const row of typeCounts) {
      if (stats[row.type as MemoryType] !== undefined) {
        stats[row.type as MemoryType] = row.count;
      }
    }

    return { stats, pinnedGlobal, pinnedProject };
  }
}
