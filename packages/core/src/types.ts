export type MemoryType = "correction" | "preference" | "decision" | "learning" | "fact";

export const MEMORY_TYPE_VALUES = [
  "correction",
  "preference",
  "decision",
  "learning",
  "fact",
] as const satisfies readonly MemoryType[];

export interface Project {
  id: string;
  name: string;
  scopeHash: string;
  createdAt: string;
  updatedAt: string;
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
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QueryOptions {
  query: string;
  type?: MemoryType;
  projectHash?: string;
  limit?: number;
}

export interface SaveOptions {
  content: string;
  type: MemoryType;
  tags?: string[];
  projectScope?: { hash: string; name: string };
  sourceHarness?: string;
}

export interface SessionContext {
  stats: Record<MemoryType, number>;
  pinnedGlobal: Memory[];
  pinnedProject: Memory[];
}
