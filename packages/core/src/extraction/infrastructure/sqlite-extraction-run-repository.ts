import type { DatabaseManager } from "../../db/manager.js";
import {
  DEFAULT_IN_FLIGHT_TIMEOUT_MS,
  DEFAULT_RECENT_COMPLETION_MS,
  decideClaim,
} from "../domain/extraction-policy.js";
import type {
  ExtractionConfig,
  ExtractionRunRecord,
  ExtractionRunRepository,
  ExtractionRunStats,
} from "../ports.js";

interface ExtractionRunRow {
  session_id: string;
  started_at: string;
  completed_at: string | null;
  status: "in_flight" | "completed" | "failed";
  error: string | null;
}

function rowToRecord(row: ExtractionRunRow): ExtractionRunRecord {
  return {
    sessionId: row.session_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    error: row.error,
  };
}

class SqliteExtractionRunRepository implements ExtractionRunRepository {
  readonly #db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.#db = db;
  }

  tryClaim(sessionId: string, now: Date, config: ExtractionConfig): boolean {
    const existing = this.#getRow(sessionId);
    const decision = decideClaim(
      existing === undefined
        ? undefined
        : {
            startedAt: new Date(existing.started_at),
            completedAt: existing.completed_at === null ? null : new Date(existing.completed_at),
            status: existing.status,
          },
      now,
      config.inFlightTimeoutMs ?? DEFAULT_IN_FLIGHT_TIMEOUT_MS,
      config.recentCompletionMs ?? DEFAULT_RECENT_COMPLETION_MS
    );
    if (decision.kind === "skip") return false;

    const startedAt = now.toISOString();
    this.#db.db
      .prepare(
        `INSERT INTO extraction_runs (session_id, started_at, completed_at, status, error)
         VALUES (?, ?, NULL, 'in_flight', NULL)
         ON CONFLICT(session_id) DO UPDATE SET
           started_at = excluded.started_at,
           completed_at = NULL,
           status = 'in_flight',
           error = NULL`
      )
      .run(sessionId, startedAt);
    return true;
  }

  markCompleted(sessionId: string, now: Date): void {
    this.#db.db
      .prepare(
        `UPDATE extraction_runs
         SET status = 'completed', completed_at = ?, error = NULL
         WHERE session_id = ?`
      )
      .run(now.toISOString(), sessionId);
  }

  markFailed(sessionId: string, now: Date, error: string): void {
    this.#db.db
      .prepare(
        `UPDATE extraction_runs
         SET status = 'failed', completed_at = ?, error = ?
         WHERE session_id = ?`
      )
      .run(now.toISOString(), error, sessionId);
  }

  reapStale(now: Date, timeoutMs: number): number {
    const cutoff = new Date(now.getTime() - timeoutMs).toISOString();
    const result = this.#db.db
      .prepare(
        `UPDATE extraction_runs
         SET status = 'failed', completed_at = ?, error = 'reaped: exceeded in-flight timeout'
         WHERE status = 'in_flight' AND started_at < ?`
      )
      .run(now.toISOString(), cutoff);
    return result.changes;
  }

  stats(now: Date, since: Date, inFlightTimeoutMs: number): ExtractionRunStats {
    const cutoff = new Date(now.getTime() - inFlightTimeoutMs).toISOString();
    const row = this.#db.db
      .prepare<{ since: string; cutoff: string }, { total: number; failed: number; stale: number }>(
        `SELECT
           COUNT(*) FILTER (WHERE started_at >= @since) AS total,
           COUNT(*) FILTER (WHERE started_at >= @since AND status = 'failed') AS failed,
           COUNT(*) FILTER (WHERE status = 'in_flight' AND started_at < @cutoff) AS stale
         FROM extraction_runs`
      )
      .get({ since: since.toISOString(), cutoff });
    return {
      total: row?.total ?? 0,
      failed: row?.failed ?? 0,
      staleInFlight: row?.stale ?? 0,
    };
  }

  get(sessionId: string): ExtractionRunRecord | undefined {
    const row = this.#getRow(sessionId);
    return row === undefined ? undefined : rowToRecord(row);
  }

  #getRow(sessionId: string): ExtractionRunRow | undefined {
    return this.#db.db
      .prepare<[string], ExtractionRunRow>("SELECT * FROM extraction_runs WHERE session_id = ?")
      .get(sessionId);
  }
}

export function createExtractionRunRepository(db: DatabaseManager): ExtractionRunRepository {
  return new SqliteExtractionRunRepository(db);
}
