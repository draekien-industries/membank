export type MemoryType = "correction" | "preference" | "decision" | "learning" | "fact";

export const MEMORY_TYPE_VALUES = [
  "correction",
  "preference",
  "decision",
  "learning",
  "fact",
] as const satisfies readonly MemoryType[];

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  tags: string[];
  scope: string;
  sourceHarness: string | null;
  accessCount: number;
  pinned: boolean;
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QueryOptions {
  query: string;
  type?: MemoryType;
  scope?: string;
  limit?: number;
}

export interface SaveOptions {
  content: string;
  type: MemoryType;
  tags?: string[];
  scope?: string;
  sourceHarness?: string;
}

export interface SessionContext {
  stats: Record<MemoryType, number>;
  pinnedGlobal: Memory[];
  pinnedProject: Memory[];
}
