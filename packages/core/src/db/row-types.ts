import type { Memory, MemoryType } from "../types.js";

export interface MemoryRow {
  id: string;
  content: string;
  type: string;
  tags: string;
  scope: string;
  source: string | null;
  access_count: number;
  pinned: number;
  needs_review: number;
  created_at: string;
  updated_at: string;
}

export function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    type: row.type as MemoryType,
    tags: JSON.parse(row.tags) as string[],
    scope: row.scope,
    sourceHarness: row.source,
    accessCount: row.access_count,
    pinned: row.pinned !== 0,
    needsReview: row.needs_review !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
