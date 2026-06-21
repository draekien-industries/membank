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
  origin: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const CAPABILITY_KIND_VALUES = ["tool", "skill"] as const;

export const CapabilityKindSchema = z.enum(CAPABILITY_KIND_VALUES);
export type CapabilityKind = z.infer<typeof CapabilityKindSchema>;

export const CapabilitySchema = z.object({
  id: z.string(),
  kind: CapabilityKindSchema,
  key: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Capability = z.infer<typeof CapabilitySchema>;

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
  primaryScopeHash: z.string(),
  sourceHarness: z.string().nullable(),
  accessCount: z.number().int().nonnegative(),
  pinned: z.boolean(),
  reviewEvents: z.array(ReviewEventSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Memory = z.infer<typeof MemorySchema>;

export const QueryFieldsSchema = z.object({
  query: z.string().min(1),
  type: MemoryTypeSchema.optional(),
  limit: z.number().int().positive().optional(),
  includePinned: z.boolean().optional(),
});

export const SaveFieldsSchema = z.object({
  content: z.string().min(1),
  type: MemoryTypeSchema,
  tags: z.array(z.string()).optional(),
  sourceHarness: z.string().optional(),
});

export const MemoryPatchSchema = z.object({
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  type: MemoryTypeSchema.optional(),
});
export type MemoryPatch = z.infer<typeof MemoryPatchSchema>;

export const SynthesisSchema = z.object({
  id: z.string(),
  scope: z.string(),
  memoryType: MemoryTypeSchema,
  content: z.string(),
  sourceMemoryHash: z.string(),
  synthesizedAt: z.string(),
  expiresAt: z.string(),
  inFlightSince: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Synthesis = z.infer<typeof SynthesisSchema>;

export const SessionContextSectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("synthesis"),
    memoryType: MemoryTypeSchema,
    content: z.string(),
  }),
  z.object({
    kind: z.literal("verbatim"),
    memoryType: MemoryTypeSchema,
    memories: z.array(z.string()),
    synthesizable: z.boolean(),
  }),
]);
export type SessionContextSection = z.infer<typeof SessionContextSectionSchema>;

export const SessionContextSchema = z.object({
  stats: z.record(MemoryTypeSchema, z.number()),
  pinnedGlobal: z.array(MemorySchema),
  pinnedProject: z.array(MemorySchema),
  sections: z.array(SessionContextSectionSchema),
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

export const MemoryVersionRowSchema = z.object({
  id: z.number(),
  memory_id: z.string(),
  version: z.number(),
  content: z.string(),
  created_at: z.string(),
});
export type MemoryVersionRow = z.infer<typeof MemoryVersionRowSchema>;

export const SynthesisVersionRowSchema = z.object({
  id: z.number(),
  scope: z.string(),
  memory_type: MemoryTypeSchema,
  version: z.number(),
  content: z.string(),
  source_memory_hash: z.string(),
  synthesized_at: z.string(),
  created_at: z.string(),
});
export type SynthesisVersionRow = z.infer<typeof SynthesisVersionRowSchema>;

export const ProjectRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope_hash: z.string(),
  origin: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ProjectRow = z.infer<typeof ProjectRowSchema>;

export const CapabilityRowSchema = z.object({
  id: z.string(),
  kind: CapabilityKindSchema,
  key: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type CapabilityRow = z.infer<typeof CapabilityRowSchema>;
