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
  origin: string | null;
  createdAt: string;
  updatedAt: string;
  memoryCount?: number;
}

export interface OrphanSuggestion {
  orphan: Project;
  target: { hash: string; name: string; origin: string };
}

export interface MergeResult {
  movedMemories: number;
  source: { id: string; name: string };
  target: { id: string; name: string };
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

export const SYNTHESIS_PENDING = "pending" as const;

export interface Synthesis {
  id: string;
  scope: string;
  memoryType: MemoryType;
  content: string;
  sourceMemoryHash: string;
  synthesizedAt: string;
  expiresAt: string;
  inFlightSince: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStats {
  total: number;
  byType: Record<MemoryType, number>;
  needsReview: number;
  pinned: number;
  mostCommonType: MemoryType | null;
  lastActive: string | null;
  harness: string | null;
  activeDays: number;
}

export interface ActivityDay {
  date: string;
  count: number;
}

export type ActivityEventType =
  | "memory.created"
  | "memory.updated"
  | "memory.deleted"
  | "memory.flagged"
  | "memory.queried";

export interface ActivityEvent {
  id: string;
  projectHash: string;
  eventType: ActivityEventType;
  memoryId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityEventFilter {
  scope?: string;
  type?: ActivityEventType;
  since?: string;
  limit?: number;
}

export interface MemoryVersion {
  version: number;
  content: string;
  createdAt: string;
}

export type SynthesisVersion = {
  memoryType: MemoryType;
  version: number;
  content: string;
  sourceMemoryHash: string;
  synthesizedAt: string;
  createdAt: string;
};

export type SessionContextSection =
  | { kind: "synthesis"; memoryType: MemoryType; content: string }
  | { kind: "verbatim"; memoryType: MemoryType; memories: string[]; synthesizable: boolean };

export type SessionContext = {
  rendered: string;
  sections: SessionContextSection[];
  pinnedGlobal: Memory[];
  pinnedProject: Memory[];
  stats: Record<MemoryType, number>;
};

export type MemoryCluster = {
  clusterId: string;
  memories: Memory[];
  maxSimilarity: number;
  isStale: boolean;
};

export type BulkOpResult = {
  id: string;
  status: "ok" | "error";
  error?: string;
};

export type CapabilityKind = "tool" | "skill";

export type Capability = {
  id: string;
  kind: CapabilityKind;
  key: string;
  createdAt: string;
  updatedAt: string;
  memoryCount: number;
};

export type CapabilitiesResponse = {
  tools: Capability[];
  skills: Capability[];
};
