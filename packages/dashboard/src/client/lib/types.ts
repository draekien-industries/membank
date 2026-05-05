export type MemoryType = "correction" | "preference" | "decision" | "learning" | "fact";

export const MEMORY_TYPES = [
  "correction",
  "preference",
  "decision",
  "learning",
  "fact",
] as const satisfies readonly MemoryType[];

export const TYPE_DESCRIPTIONS = {
  correction: "Overrides or corrects the AI's default behavior",
  preference: "Your preferred way of working or coding style",
  decision: "A deliberate choice about how to approach something",
  learning: "Something the AI learned about your codebase or context",
  fact: "A fixed fact about your project or environment",
} satisfies Record<MemoryType, string>;

export interface Project {
  id: string;
  name: string;
  scopeHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewEvent {
  id: string;
  memoryId: string;
  conflictingMemoryId: string | null;
  similarity: number;
  conflictContentSnapshot: string;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  tags: string[];
  projects: Project[];
  sourceHarness: string | null;
  accessCount: number;
  pinned: boolean;
  reviewEvents: ReviewEvent[];
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
