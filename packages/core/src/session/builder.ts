import type { DatabaseManager } from "../db/manager.js";
import type { Memory, MemoryType, SessionContext } from "../types.js";
import { MEMORY_TYPE_VALUES } from "../types.js";

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

interface TypeCountRow {
  type: string;
  count: number;
}

function rowToMemory(row: MemoryRow): Memory {
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
