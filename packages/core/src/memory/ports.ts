import type { Memory, MemoryPatch, MemoryType } from "./domain/memory.js";
import type { MemoryVersion } from "./domain/memory-version.js";
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

export interface ReviewQueueStats {
  pairs: number;
  clusters: number;
  byBand: { high: number; mid: number; low: number };
  byType: Partial<Record<MemoryType, number>>;
}

export interface BulkOpResult {
  id: string;
  status: "ok" | "error";
  error?: string;
}

export interface MergeMemoriesOpts {
  keepId: string;
  dropIds: string[];
  mergedContent: string;
}

export interface AtomicMergeOpts {
  keepId: string;
  mergedContent: string;
  embedding: Float32Array;
  tags: string[];
  pinned: boolean;
  accessCount: number;
  deleteIds: string[];
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
  projectScope?: { hash: string; name: string; origin?: string | undefined };
}

export interface CreateReviewEventOpts {
  memoryId: string;
  conflictingMemoryId: string;
  similarity: number;
  conflictContentSnapshot: string;
}

export interface MemoryRepository {
  findById(id: string): Memory | undefined;
  findManyById(ids: string[]): Memory[];
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
  listFlagged(opts?: {
    projectHash?: string;
    limit?: number;
    minSimilarity?: number;
    maxSimilarity?: number;
  }): Memory[];
  listReviewEdges(projectHash?: string): Array<{ memoryId: string; conflictingMemoryId: string }>;
  listReviewEvents(memoryId: string, opts?: { unresolvedOnly?: boolean }): ReviewEvent[];
  getPinnedCharCount(projectHash?: string): number;
  stats(projectHash?: string): StatsResult;
  reviewQueueStats(projectHash?: string): Omit<ReviewQueueStats, "clusters">;

  create(opts: CreateMemoryOpts): Memory;
  overwrite(id: string, content: string, embedding: Float32Array): Memory;
  update(id: string, patch: MemoryPatch, embedding?: Float32Array): Memory;
  delete(id: string): void;
  createReviewEvent(opts: CreateReviewEventOpts): void;
  resolveReviewEvents(memoryId: string): void;
  setPin(id: string, pinned: boolean): Memory;
  incrementAccessCount(id: string): void;
  incrementAccessCountBy(id: string, delta: number): void;
  atomicMerge(opts: AtomicMergeOpts): Memory;
  exportAll(): MemoryExportRecord[];
  importAll(records: MemoryExportRecord[]): void;
  listVersions(memoryId: string): MemoryVersion[];
  getVersion(memoryId: string, version: number): MemoryVersion | undefined;
}

export interface Embedder {
  embed(text: string): Promise<Float32Array>;
}
