import { MemoryTypeSchema } from "@membank/core";
import { z } from "zod";

const QueryScopeSchema = z
  .enum(["current", "global", "all"])
  .optional()
  .describe(
    '"current" (default) = this project + global memories; "global" = global memories only; "all" = every project'
  );

const SaveScopeSchema = z
  .enum(["current", "global"])
  .optional()
  .describe('"current" (default) = scoped to this project; "global" = saved as a global memory');

export const SaveMemoryArgsSchema = z.object({
  content: z.string().min(1),
  type: MemoryTypeSchema,
  tags: z.array(z.string()).optional(),
  scope: SaveScopeSchema,
});

export const UpdateMemoryArgsSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1).optional(),
  type: MemoryTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
});

export const DeleteMemoryArgsSchema = z.object({
  id: z.string().min(1),
});

export const QueryMemoryArgsSchema = z.object({
  query: z.string().min(1),
  type: MemoryTypeSchema.optional(),
  limit: z.number().int().positive().optional(),
  includePinned: z.boolean().optional(),
  scope: QueryScopeSchema,
});

export const RunMigrationArgsSchema = z.object({
  name: z.string().min(1).describe("Migration name to execute"),
});

export const PinMemoryArgsSchema = z.object({
  id: z.string().min(1),
});

export const ResolveReviewArgsSchema = z.object({
  id: z.string().min(1),
});

export const ListFlaggedMemoriesArgsSchema = z.object({
  scope: QueryScopeSchema,
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe("Maximum number of flagged memories to return"),
  minSimilarity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Only include memories whose review event similarity is at or above this threshold"),
  maxSimilarity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Only include memories whose review event similarity is at or below this threshold"),
});

export const GetMemorySummaryArgsSchema = z.object({
  scope: QueryScopeSchema,
});

export const DeleteManyArgsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export const ResolveManyArgsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export const MergeMemoriesArgsSchema = z.object({
  keep_id: z.string().min(1),
  drop_ids: z.array(z.string().min(1)).min(1).max(20),
  merged_content: z.string().min(1),
});

export const ListMemoryHistoryArgsSchema = z.object({
  id: z.string().min(1).describe("Memory ID to retrieve version history for"),
});
