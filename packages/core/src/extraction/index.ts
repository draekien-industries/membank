export type { RunExtractionInput, RunExtractionResult } from "./application/run-extraction.js";
export { runExtraction } from "./application/run-extraction.js";
export type {
  Actionability,
  AdmissionDecision,
  Derivability,
  Durability,
  MemoryCandidate,
  RejectionClause,
} from "./domain/admission-policy.js";
export {
  ACTIONABILITY_VALUES,
  DERIVABILITY_VALUES,
  DURABILITY_VALUES,
  decideAdmission,
  explainRejection,
} from "./domain/admission-policy.js";
export type { ContentSmell } from "./domain/content-smells.js";
export { CONTENT_SMELL_VALUES, detectContentSmells } from "./domain/content-smells.js";
export {
  DEFAULT_IN_FLIGHT_TIMEOUT_MS,
  DEFAULT_RECENT_COMPLETION_MS,
  REJECTION_RETENTION_MS,
} from "./domain/extraction-policy.js";
export { createExtractionAgentRunner } from "./infrastructure/claude-agent-runner.js";
export { createExtractionRunRepository } from "./infrastructure/sqlite-extraction-run-repository.js";
export { createRejectedCandidateRepository } from "./infrastructure/sqlite-rejected-candidate-repository.js";
export { createClaudeCodeTranscriptReader } from "./infrastructure/transcript-reader.js";
export type {
  ExtractionAgentRunner,
  ExtractionConfig,
  ExtractionRunRecord,
  ExtractionRunRepository,
  ExtractionRunStats,
  ExtractionTools,
  RejectedCandidate,
  RejectedCandidateRepository,
  RejectionClauseCount,
  TranscriptReader,
  TranscriptReadResult,
} from "./ports.js";
