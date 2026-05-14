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

export interface ExtractionRunRepository {
  /** Atomic claim: returns true if the caller should proceed, false if already in flight or recently completed. */
  tryClaim(sessionId: string, now: Date, config: ExtractionConfig): boolean;
  markCompleted(sessionId: string, now: Date): void;
  markFailed(sessionId: string, now: Date, error: string): void;
  get(sessionId: string): ExtractionRunRecord | undefined;
}

export interface TranscriptReader {
  /** Returns the recent transcript content (plain text) for the agent to inspect. */
  read(transcriptPath: string): Promise<string>;
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
