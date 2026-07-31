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
  }) => Promise<string>;
  updateMemory: (args: {
    id: string;
    content?: string;
    type?: string;
    tags?: string[];
  }) => Promise<string>;
}
