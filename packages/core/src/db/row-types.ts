import { MemoryTypeSchema, TagsJsonSchema } from "../schemas.js";
import type { Memory, MemoryRow, Project, ProjectRow } from "../types.js";

export function rowToMemory(row: MemoryRow, projects: Project[]): Memory {
  return {
    id: row.id,
    content: row.content,
    type: MemoryTypeSchema.parse(row.type),
    tags: TagsJsonSchema.parse(JSON.parse(row.tags)),
    projects,
    sourceHarness: row.source,
    accessCount: row.access_count,
    pinned: row.pinned !== 0,
    needsReview: row.needs_review !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
