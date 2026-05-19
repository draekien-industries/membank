import type { Synthesis } from "../schemas.js";
import type { DirtyScope } from "./domain/synthesis-job.js";
import type { SynthesisVersion } from "./domain/synthesis-version.js";

export interface SynthesisConfig {
  enabled: boolean;
  maxTokensPerRun?: number;
  debounceMs?: number;
  stalenessDays?: number;
  inFlightTimeoutMs?: number;
}

export interface SynthesisTools {
  queryMemory: (args: {
    query: string;
    limit?: number;
    global?: boolean;
    projectHash?: string;
  }) => Promise<string>;
  getMemorySummary: () => Promise<string>;
}

export interface AgentRunner {
  run(scope: string, projectHash?: string): Promise<string>;
}

export interface SynthesisRepository {
  saveSynthesis(scope: string, content: string, sourceHash: string): Synthesis;
  getSynthesis(scope: string): Synthesis | undefined;
  listAll(): Synthesis[];
  listVersions(scope: string): SynthesisVersion[];
  getVersion(scope: string, version: number): SynthesisVersion | undefined;
  markInFlight(scope: string): void;
  clearInFlight(scope: string): void;
  clearStaleInFlight(thresholdMs: number): void;
  computeSourceMemoryHash(scope: string): string;
  getExpiredOrDirtyScopes(): DirtyScope[];
  getAllActiveScopes(): string[];
  expireStale(): void;
}
