import type { Memory, MemoryType } from "../memory/domain/memory.js";
import type { QueryOptions } from "../types.js";

export interface ScoredMemory extends Memory {
  score: number;
}

export interface QueryAdapter {
  findByEmbedding(
    embedding: Buffer,
    opts: { type?: MemoryType; projectHash?: string; includePinned?: boolean }
  ): Array<Memory & { cosineSim: number }>;
}

export interface Querier {
  query(opts: QueryOptions): Promise<ScoredMemory[]>;
}
