import { randomUUID } from "node:crypto";
import type { DatabaseManager } from "../../db/manager.js";
import { rowToCapability, rowToMemory } from "../../persistence/infrastructure/row-types.js";
import type { ProjectRepository } from "../../project/ports.js";
import type {
  Capability,
  CapabilityKind,
  CapabilityRow,
  Memory,
  MemoryRow,
} from "../../schemas.js";
import { CapabilityRowSchema, MemoryRowSchema } from "../../schemas.js";
import type { CapabilityKey } from "../domain/capability-key.js";
import type { CapabilityRepository } from "../ports.js";

const MAX_CAPABILITY_MEMORIES = 25;

type CapabilityCountRow = CapabilityRow & { memory_count: number };

export class SqliteCapabilityRepository implements CapabilityRepository {
  readonly #db: DatabaseManager;
  readonly #projects: ProjectRepository;

  constructor(db: DatabaseManager, projects: ProjectRepository) {
    this.#db = db;
    this.#projects = projects;
  }

  upsertByKey(key: CapabilityKey): Capability {
    const now = new Date().toISOString();
    this.#db.db
      .prepare(
        `INSERT INTO capabilities (id, kind, key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO NOTHING`
      )
      .run(randomUUID(), key.kind, key.toString(), now, now);

    const row = CapabilityRowSchema.parse(
      this.#db.db
        .prepare<[string], unknown>(`SELECT * FROM capabilities WHERE key = ?`)
        .get(key.toString())
    );
    return rowToCapability(row);
  }

  findByKey(key: CapabilityKey): Capability | null {
    const row = this.#db.db
      .prepare<[string], unknown>(`SELECT * FROM capabilities WHERE key = ?`)
      .get(key.toString());
    return row !== undefined ? rowToCapability(CapabilityRowSchema.parse(row)) : null;
  }

  listByKind(kind: CapabilityKind): Array<Capability & { memoryCount: number }> {
    const rows = this.#db.db
      .prepare<[CapabilityKind], CapabilityCountRow>(
        `SELECT c.*, COUNT(mc.memory_id) AS memory_count
         FROM capabilities c
         LEFT JOIN memory_capabilities mc ON mc.capability_id = c.id
         WHERE c.kind = ?
         GROUP BY c.id
         ORDER BY c.key ASC`
      )
      .all(kind);
    return rows.map((row) => ({
      ...rowToCapability(CapabilityRowSchema.parse(row)),
      memoryCount: row.memory_count,
    }));
  }

  associate(memoryId: string, capabilityId: string): void {
    this.#db.db
      .prepare(`INSERT OR IGNORE INTO memory_capabilities (memory_id, capability_id) VALUES (?, ?)`)
      .run(memoryId, capabilityId);
  }

  allMemoriesForCapability(key: CapabilityKey): Memory[] {
    const rows = this.#db.db
      .prepare<[string, number], MemoryRow>(
        `SELECT m.* FROM memories m
         JOIN memory_capabilities mc ON mc.memory_id = m.id
         JOIN capabilities c ON c.id = mc.capability_id
         WHERE c.key = ?
         ORDER BY m.created_at DESC
         LIMIT ?`
      )
      .all(key.toString(), MAX_CAPABILITY_MEMORIES);

    if (rows.length === 0) return [];

    const parsed = rows.map((row) => MemoryRowSchema.parse(row));
    const ids = parsed.map((row) => row.id);
    const projectMap = this.#projects.getProjectsForMemories(ids);
    return parsed.map((row) => rowToMemory(row, projectMap.get(row.id) ?? []));
  }
}

export function createCapabilityRepository(
  db: DatabaseManager,
  projects: ProjectRepository
): CapabilityRepository {
  return new SqliteCapabilityRepository(db, projects);
}
