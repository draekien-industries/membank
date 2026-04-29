export type MemoryType = "correction" | "preference" | "decision" | "learning" | "fact";

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

export interface Stats {
  byType: Record<MemoryType, number>;
  total: number;
  needsReview: number;
}

export interface Filters {
  search: string;
  type: MemoryType | "";
  pinned: boolean;
  needsReview: boolean;
}
