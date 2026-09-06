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
    this.#db.mutate(
      `INSERT INTO extraction_runs (session_id, started_at, completed_at, status, error)
       VALUES (?, ?, NULL, 'in_flight', NULL)
       ON CONFLICT(session_id) DO UPDATE SET
         started_at = excluded.started_at,
         completed_at = NULL,
         status = 'in_flight',
         error = NULL`,
      sessionId,
      startedAt
    );
    return true;
  }

  markCompleted(sessionId: string, now: Date): void {
    this.#db.mutate(
      `UPDATE extraction_runs
       SET status = 'completed', completed_at = ?, error = NULL
       WHERE session_id = ?`,
      now.toISOString(),
      sessionId
    );
  }

  markFailed(sessionId: string, now: Date, error: string): void {
    this.#db.mutate(
      `UPDATE extraction_runs
       SET status = 'failed', completed_at = ?, error = ?
       WHERE session_id = ?`,
      now.toISOString(),
      error,
      sessionId
    );
  }

  reapStale(now: Date, timeoutMs: number): number {
    const cutoff = new Date(now.getTime() - timeoutMs).toISOString();
    return this.#db.mutate(
      `UPDATE extraction_runs
       SET status = 'failed', completed_at = ?, error = 'reaped: exceeded in-flight timeout'
       WHERE status = 'in_flight' AND started_at < ?`,
      now.toISOString(),
      cutoff
    );
  }

  stats(now: Date, since: Date, inFlightTimeoutMs: number): ExtractionRunStats {
    const cutoff = new Date(now.getTime() - inFlightTimeoutMs).toISOString();
    const sinceIso = since.toISOString();
    const row = this.#db.one<{ total: number; failed: number; stale: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE started_at >= ?) AS total,
         COUNT(*) FILTER (WHERE started_at >= ? AND status = 'failed') AS failed,
         COUNT(*) FILTER (WHERE status = 'in_flight' AND started_at < ?) AS stale
       FROM extraction_runs`,
      sinceIso,
      sinceIso,
      cutoff
    );
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
    return this.#db.one<ExtractionRunRow>(
      "SELECT * FROM extraction_runs WHERE session_id = ?",
      sessionId
    );
  }
}

export function createExtractionRunRepository(db: DatabaseManager): ExtractionRunRepository {
  return new SqliteExtractionRunRepository(db);
}
