import type { MemoryVersion } from "../../memory/domain/memory-version.js";
import { MemoryTypeSchema, ReviewEventRowSchema, TagsJsonSchema } from "../../schemas.js";
import type { SynthesisVersion } from "../../synthesis/domain/synthesis-version.js";
import type {
  Memory,
  MemoryRow,
  MemoryVersionRow,
  Project,
  ProjectRow,
  ReviewEvent,
  ReviewEventRow,
  SynthesisVersionRow,
} from "../../types.js";

export function rowToMemory(
  row: MemoryRow,
  projects: Project[],
  reviewEvents: ReviewEvent[] = []
): Memory {
  return {
    id: row.id,
    content: row.content,
    type: MemoryTypeSchema.parse(row.type),
    tags: TagsJsonSchema.parse(JSON.parse(row.tags)),
    projects,
    sourceHarness: row.source,
    accessCount: row.access_count,
    pinned: row.pinned !== 0,
    reviewEvents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToReviewEvent(row: ReviewEventRow): ReviewEvent {
  const parsed = ReviewEventRowSchema.parse(row);
  return {
    id: parsed.id,
    memoryId: parsed.memory_id,
    conflictingMemoryId: parsed.conflicting_memory_id,
    similarity: parsed.similarity,
    conflictContentSnapshot: parsed.conflict_content_snapshot,
    reason: parsed.reason,
    createdAt: parsed.created_at,
    resolvedAt: parsed.resolved_at,
  };
}

export function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    scopeHash: row.scope_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToMemoryVersion(row: MemoryVersionRow): MemoryVersion {
  return {
    version: row.version,
    content: row.content,
    createdAt: row.created_at,
  };
}

export function rowToSynthesisVersion(row: SynthesisVersionRow): SynthesisVersion {
  return {
    version: row.version,
    content: row.content,
    sourceMemoryHash: row.source_memory_hash,
    synthesizedAt: row.synthesized_at,
    createdAt: row.created_at,
  };
}
