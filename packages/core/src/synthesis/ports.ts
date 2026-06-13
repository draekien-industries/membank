import type { MemoryType, Synthesis } from "../schemas.js";
import type { DirtyScope } from "./domain/synthesis-job.js";
import type { SynthesisVersion } from "./domain/synthesis-version.js";

export interface SynthesisConfig {
  enabled: boolean;
  maxTokensPerRun?: number;
  debounceMs?: number;
  stalenessDays?: number;
  inFlightTimeoutMs?: number;
  synthesisThresholdWords?: number;
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
  run(scope: string, type: MemoryType, memories: readonly string[]): Promise<string>;
}

export interface SynthesisRepository {
  saveSynthesis(
    scope: string,
    memoryType: MemoryType,
    content: string,
    sourceHash: string
  ): Synthesis;
  getSynthesis(scope: string, memoryType: MemoryType): Synthesis | undefined;
  listAll(): Synthesis[];
  listVersions(scope: string, memoryType: MemoryType): SynthesisVersion[];
  getVersion(scope: string, memoryType: MemoryType, version: number): SynthesisVersion | undefined;
  markInFlight(scope: string, memoryType: MemoryType): void;
  clearInFlight(scope: string, memoryType: MemoryType): void;
  clearStaleInFlight(thresholdMs: number): void;
  nonPinnedMemoryContents(scope: string, memoryType: MemoryType): string[];
  sourceMemoryHash(scope: string, memoryType: MemoryType): string;
  getExpiredOrDirtyScopes(): DirtyScope[];
  getAllActiveScopes(): string[];
  expireStale(): void;
  initializeAndGetDirtyScopes(inFlightTimeoutMs: number): DirtyScope[];
}
