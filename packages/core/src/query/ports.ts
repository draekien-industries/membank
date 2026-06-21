import type { Memory, MemoryType } from "../memory/domain/memory.js";
import type { QueryOptions } from "./application/query-memories.js";

export interface ScoredMemory extends Memory {
  score: number;
}

export interface QueryAdapter {
  findByEmbedding(
    embedding: Float32Array,
    opts: {
      type?: MemoryType;
      projectHash?: string;
      capabilityKey?: string;
      includePinned?: boolean;
    }
  ): Array<Memory & { cosineSim: number }>;
  incrementAccessCount(id: string): void;
}

export interface Querier {
  query(opts: QueryOptions): Promise<ScoredMemory[]>;
}
