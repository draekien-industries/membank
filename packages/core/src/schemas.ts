import { z } from "zod";

export const MEMORY_TYPE_VALUES = [
  "correction",
  "preference",
  "decision",
  "learning",
  "fact",
] as const;

export const MemoryTypeSchema = z.enum(MEMORY_TYPE_VALUES);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const TagsJsonSchema = z.array(z.string());

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopeHash: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ReviewReasonSchema = z.enum(["similarity_dedup"]);
export type ReviewReason = z.infer<typeof ReviewReasonSchema>;

export const ReviewEventSchema = z.object({
  id: z.string(),
  memoryId: z.string(),
  conflictingMemoryId: z.string().nullable(),
  similarity: z.number(),
  conflictContentSnapshot: z.string(),
  reason: ReviewReasonSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type ReviewEvent = z.infer<typeof ReviewEventSchema>;

export const ReviewEventRowSchema = z.object({
  id: z.string(),
  memory_id: z.string(),
  conflicting_memory_id: z.string().nullable(),
  similarity: z.number(),
  conflict_content_snapshot: z.string(),
  reason: ReviewReasonSchema,
  created_at: z.string(),
  resolved_at: z.string().nullable(),
});
export type ReviewEventRow = z.infer<typeof ReviewEventRowSchema>;

export const MemorySchema = z.object({
  id: z.string(),
  content: z.string(),
  type: MemoryTypeSchema,
  tags: z.array(z.string()),
  projects: z.array(ProjectSchema),
  sourceHarness: z.string().nullable(),
  accessCount: z.number().int().nonnegative(),
  pinned: z.boolean(),
  reviewEvents: z.array(ReviewEventSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Memory = z.infer<typeof MemorySchema>;

export const QueryOptionsSchema = z.object({
  query: z.string().min(1),
  type: MemoryTypeSchema.optional(),
  projectHash: z.string().optional(),
  limit: z.number().int().positive().optional(),
  includePinned: z.boolean().optional(),
});
export type QueryOptions = z.infer<typeof QueryOptionsSchema>;

export const SaveOptionsSchema = z.object({
  content: z.string().min(1),
  type: MemoryTypeSchema,
  tags: z.array(z.string()).optional(),
  projectScope: z.object({ hash: z.string(), name: z.string() }).optional(),
  sourceHarness: z.string().optional(),
});
export type SaveOptions = z.infer<typeof SaveOptionsSchema>;

export const MemoryPatchSchema = z.object({
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
});
export type MemoryPatch = z.infer<typeof MemoryPatchSchema>;

export const SessionContextSchema = z.object({
  stats: z.record(MemoryTypeSchema, z.number()),
  pinnedGlobal: z.array(MemorySchema),
  pinnedProject: z.array(MemorySchema),
});
export type SessionContext = z.infer<typeof SessionContextSchema>;

export const MemoryRowSchema = z.object({
  id: z.string(),
  content: z.string(),
  type: z.string(),
  tags: z.string(),
  source: z.string().nullable(),
  access_count: z.number(),
  pinned: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type MemoryRow = z.infer<typeof MemoryRowSchema>;

export const ProjectRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope_hash: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ProjectRow = z.infer<typeof ProjectRowSchema>;
