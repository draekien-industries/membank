import { randomUUID } from "node:crypto";
import type { DatabaseManager } from "../../db/manager.js";
import type { RejectionClause } from "../domain/admission-policy.js";
import type {
  RejectedCandidate,
  RejectedCandidateRepository,
  RejectionClauseCount,
} from "../ports.js";

class SqliteRejectedCandidateRepository implements RejectedCandidateRepository {
  readonly #db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.#db = db;
  }

  record(candidate: RejectedCandidate, now: Date): void {
    this.#db.mutate(
      `INSERT INTO rejected_candidates
         (id, content, type, durability, derivability, actionability,
          evidence_quote, rejected_clause, smells, session_id, project_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      candidate.content,
      candidate.type,
      candidate.durability,
      candidate.derivability,
      candidate.actionability,
      candidate.evidenceQuote,
      candidate.rejectedClause,
      JSON.stringify(candidate.smells),
      candidate.sessionId,
      candidate.projectHash,
      now.toISOString()
    );
  }

  prune(before: Date): number {
    return this.#db.mutate(
      "DELETE FROM rejected_candidates WHERE created_at < ?",
      before.toISOString()
    );
  }

  countByClause(since: Date): RejectionClauseCount[] {
    return this.#db.query<{ clause: RejectionClause; count: number }>(
      `SELECT rejected_clause AS clause, COUNT(*) AS count
       FROM rejected_candidates
       WHERE created_at >= ?
       GROUP BY rejected_clause
       ORDER BY count DESC`,
      since.toISOString()
    );
  }
}

export function createRejectedCandidateRepository(
  db: DatabaseManager
): RejectedCandidateRepository {
  return new SqliteRejectedCandidateRepository(db);
}
