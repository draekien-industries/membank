import type {
  Actionability,
  Derivability,
  Durability,
  RejectionClause,
} from "./domain/admission-policy.js";
import type { ContentSmell } from "./domain/content-smells.js";

export interface ExtractionConfig {
  /** Window after a run starts during which a duplicate run for the same session_id is skipped. */
  inFlightTimeoutMs?: number;
  /** Window after a successful run during which a repeated run for the same session_id is skipped. */
  recentCompletionMs?: number;
}

export interface ExtractionRunRecord {
  sessionId: string;
  startedAt: string;
  completedAt: string | null;
  status: "in_flight" | "completed" | "failed";
  error: string | null;
}

export interface ExtractionRunStats {
  total: number;
  failed: number;
  /** In-flight rows past the timeout — runs whose process died and which nothing will retry. */
  staleInFlight: number;
}

export interface ExtractionRunRepository {
  /** Atomic claim: returns true if the caller should proceed, false if already in flight or recently completed. */
  tryClaim(sessionId: string, now: Date, config: ExtractionConfig): boolean;
  markCompleted(sessionId: string, now: Date): void;
  markFailed(sessionId: string, now: Date, error: string): void;
  get(sessionId: string): ExtractionRunRecord | undefined;
  /** Fails out in-flight runs whose process died without ever retrying the session id. Returns the number reaped. */
  reapStale(now: Date, timeoutMs: number): number;
  /** Run counts since `since`, plus the all-time stale in-flight count. */
  stats(now: Date, since: Date, inFlightTimeoutMs: number): ExtractionRunStats;
}

export interface RejectedCandidate {
  content: string;
  type: string;
  durability: Durability;
  derivability: Derivability;
  actionability: Actionability;
  evidenceQuote: string;
  rejectedClause: RejectionClause;
  smells: ContentSmell[];
  sessionId: string;
  projectHash: string | null;
}

export interface RejectionClauseCount {
  clause: RejectionClause;
  count: number;
}

export interface RejectedCandidateRecord extends RejectedCandidate {
  id: string;
  createdAt: string;
}

export interface RejectedCandidateFilter {
  clause?: RejectionClause;
  projectHash?: string;
  limit?: number;
}

export interface RejectedCandidateRepository {
  record(candidate: RejectedCandidate, now: Date): void;
  /**
   * Drops rejections older than `before`. Rows awaiting promotion go with them: this is a review
   * queue with a horizon, not an archive.
   */
  prune(before: Date): number;
  countByClause(since: Date): RejectionClauseCount[];
  /** Newest first. */
  list(filter?: RejectedCandidateFilter): RejectedCandidateRecord[];
  get(id: string): RejectedCandidateRecord | undefined;
  /** Returns false when the row was already pruned or promoted. */
  remove(id: string): boolean;
}

/**
 * Writes a promoted candidate into the memory corpus. Promotion is a human override of the
 * admission gate, so the writer — not the caller — owns scope resolution and provenance.
 */
export interface PromotedMemoryWriter {
  save(args: {
    content: string;
    type: string;
    durability: Durability;
    projectHash: string | null;
  }): Promise<{ id: string }>;
}

export type TranscriptReadResult = { status: "read"; chunks: string[] } | { status: "unavailable" };

export interface TranscriptReader {
  /** Returns the transcript split into turn-aligned chunks, or `unavailable` when the harness named a file that is not on disk. */
  read(transcriptPath: string): Promise<TranscriptReadResult>;
}

export interface ExtractionAgentRunner {
  /** Runs the extraction agent over the supplied transcript text and project hash. */
  run(args: { transcript: string; projectHash: string; sessionId: string }): Promise<void>;
}

export interface ExtractionTools {
  queryMemory: (args: {
    query: string;
    limit?: number;
    global?: boolean;
    projectHash?: string;
  }) => Promise<string>;
  saveMemory: (args: {
    content: string;
    type: string;
    tags?: string[];
    global?: boolean;
    durability: Durability;
  }) => Promise<string>;
  updateMemory: (args: {
    id: string;
    content?: string;
    type?: string;
    tags?: string[];
  }) => Promise<string>;
}
