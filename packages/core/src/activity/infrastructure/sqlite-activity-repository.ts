import type { DatabaseManager } from "../../db/manager.js";
import { logEvent } from "../application/log-event.js";
import type { ActivityEvent } from "../domain/activity-event.js";
import { ActivityEventTypeSchema } from "../domain/activity-event.js";
import type { ActivityLogger, ActivityRepository } from "../ports.js";

interface ActivityEventRow {
  id: string;
  project_hash: string;
  event_type: string;
  memory_id: string | null;
  payload: string;
  created_at: string;
}

function rowToEvent(row: ActivityEventRow): ActivityEvent {
  return {
    id: row.id,
    projectHash: row.project_hash,
    eventType: ActivityEventTypeSchema.parse(row.event_type),
    memoryId: row.memory_id,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

const PRUNE_THROTTLE_MS = 60_000;

export class SqliteActivityRepository implements ActivityRepository {
  readonly #db: DatabaseManager;
  #lastPruned = 0;

  readonly #stmtInsert;
  readonly #stmtPrune;

  constructor(db: DatabaseManager) {
    this.#db = db;
    this.#stmtInsert = db.db.prepare(
      `INSERT INTO activity_events (id, project_hash, event_type, memory_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    this.#stmtPrune = db.db.prepare(`DELETE FROM activity_events WHERE created_at < ?`);
  }

  insert(event: {
    id: string;
    projectHash: string;
    eventType: string;
    memoryId: string | null;
    payload: Record<string, unknown>;
    createdAt: string;
  }): void {
    try {
      this.#stmtInsert.run(
        event.id,
        event.projectHash,
        event.eventType,
        event.memoryId,
        JSON.stringify(event.payload),
        event.createdAt
      );
    } catch {
      // FK violation: project_hash not yet in projects table — silently skip
    }
  }

  list(filter: { scope?: string; type?: string; since?: string; limit?: number }): ActivityEvent[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.scope !== undefined) {
      conditions.push("project_hash = ?");
      params.push(filter.scope);
    }
    if (filter.type !== undefined) {
      conditions.push("event_type = ?");
      params.push(filter.type);
    }
    if (filter.since !== undefined) {
      conditions.push("created_at >= ?");
      params.push(filter.since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = filter.limit !== undefined ? "LIMIT ?" : "";
    if (filter.limit !== undefined) params.push(filter.limit);

    const rows = this.#db.db
      .prepare<(string | number)[], ActivityEventRow>(
        `SELECT * FROM activity_events ${where} ORDER BY created_at DESC ${limitClause}`
      )
      .all(...params);

    return rows.map(rowToEvent);
  }

  prune(olderThan: string): void {
    const now = Date.now();
    if (now - this.#lastPruned < PRUNE_THROTTLE_MS) return;
    this.#stmtPrune.run(olderThan);
    this.#lastPruned = now;
  }
}

export function createActivityRepository(db: DatabaseManager): SqliteActivityRepository {
  return new SqliteActivityRepository(db);
}

export function createActivityLogger(db: DatabaseManager): ActivityLogger {
  const repo = new SqliteActivityRepository(db);
  return { logEvent: (input) => logEvent(input, repo) };
}
