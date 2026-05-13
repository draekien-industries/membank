import type { Memory, MemoryPatch, MemoryType } from "./domain/memory.js";
import type { ReviewEvent } from "./domain/review-event.js";

export interface SimilarMemoryResult {
  id: string;
  similarity: number;
}

export interface StatsResult {
  byType: Record<MemoryType, number>;
  total: number;
  pinned: number;
  needsReview: number;
  pinBudgetChars: number;
}

export interface MemoryExportRecord {
  id: string;
  content: string;
  type: MemoryType;
  tags: string[];
  sourceHarness: string | null;
  accessCount: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  embedding: Float32Array | null;
}

export interface CreateMemoryOpts {
  id: string;
  content: string;
  type: MemoryType;
  tags: string[];
  sourceHarness: string | null;
  embedding: Float32Array;
  projectScope?: { hash: string; name: string };
}

export interface CreateReviewEventOpts {
  memoryId: string;
  conflictingMemoryId: string;
  similarity: number;
  conflictContentSnapshot: string;
}

export interface MemoryRepository {
  findById(id: string): Memory | undefined;
  findSimilar(
    embedding: Float32Array,
    type: MemoryType,
    projectHash?: string
  ): SimilarMemoryResult[];
  list(opts?: {
    type?: MemoryType;
    pinned?: boolean;
    needsReview?: boolean;
    projectId?: string;
  }): Memory[];
  listPinnedGlobal(): Memory[];
  listPinnedForProject(projectHash: string): Memory[];
  listFlagged(): Memory[];
  listReviewEvents(memoryId: string, opts?: { unresolvedOnly?: boolean }): ReviewEvent[];
  getPinnedCharCount(): number;
  stats(): StatsResult;

  create(opts: CreateMemoryOpts): Memory;
  overwrite(id: string, content: string, embedding: Float32Array): Memory;
  update(id: string, patch: MemoryPatch, embedding?: Float32Array): Memory;
  delete(id: string): void;
  createReviewEvent(opts: CreateReviewEventOpts): void;
  resolveReviewEvents(memoryId: string): void;
  setPin(id: string, pinned: boolean): Memory;
  incrementAccessCount(id: string): void;
  exportAll(): MemoryExportRecord[];
  importAll(records: MemoryExportRecord[]): void;
}

export interface Embedder {
  embed(text: string): Promise<Float32Array>;
}
