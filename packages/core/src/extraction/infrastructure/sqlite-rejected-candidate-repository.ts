import { randomUUID } from "node:crypto";
import type { DatabaseManager } from "../../db/manager.js";
import type {
  Actionability,
  Derivability,
  Durability,
  RejectionClause,
} from "../domain/admission-policy.js";
import type { ContentSmell } from "../domain/content-smells.js";
import type {
  RejectedCandidate,
  RejectedCandidateFilter,
  RejectedCandidateRecord,
  RejectedCandidateRepository,
  RejectionClauseCount,
} from "../ports.js";

interface RejectedCandidateRow {
  id: string;
  content: string;
  type: string;
  durability: Durability;
  derivability: Derivability;
  actionability: Actionability;
  evidence_quote: string;
  rejected_clause: RejectionClause;
  smells: string;
  session_id: string;
  project_hash: string | null;
  created_at: string;
}

const SELECT_COLUMNS = `id, content, type, durability, derivability, actionability,
       evidence_quote, rejected_clause, smells, session_id, project_hash, created_at`;

function toRecord(row: RejectedCandidateRow): RejectedCandidateRecord {
  return {
    id: row.id,
    content: row.content,
    type: row.type,
    durability: row.durability,
    derivability: row.derivability,
    actionability: row.actionability,
    evidenceQuote: row.evidence_quote,
    rejectedClause: row.rejected_clause,
    smells: JSON.parse(row.smells) as ContentSmell[],
    sessionId: row.session_id,
    projectHash: row.project_hash,
    createdAt: row.created_at,
  };
}

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

  list(filter: RejectedCandidateFilter = {}): RejectedCandidateRecord[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.clause !== undefined) {
      conditions.push("rejected_clause = ?");
      params.push(filter.clause);
    }
    if (filter.projectHash !== undefined) {
      conditions.push("project_hash = ?");
      params.push(filter.projectHash);
    }

    const where = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
    const limit = filter.limit === undefined ? "" : "LIMIT ?";
    if (filter.limit !== undefined) params.push(filter.limit);

    return this.#db
      .query<RejectedCandidateRow>(
        `SELECT ${SELECT_COLUMNS}
         FROM rejected_candidates
         ${where}
         ORDER BY created_at DESC
         ${limit}`,
        ...params
      )
      .map(toRecord);
  }

  get(id: string): RejectedCandidateRecord | undefined {
    const row = this.#db.one<RejectedCandidateRow>(
      `SELECT ${SELECT_COLUMNS} FROM rejected_candidates WHERE id = ?`,
      id
    );
    return row === undefined ? undefined : toRecord(row);
  }

  remove(id: string): boolean {
    return this.#db.mutate("DELETE FROM rejected_candidates WHERE id = ?", id) > 0;
  }
}

export function createRejectedCandidateRepository(
  db: DatabaseManager
): RejectedCandidateRepository {
  return new SqliteRejectedCandidateRepository(db);
}
