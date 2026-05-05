import { MemoryTypeSchema } from "@membank/core";
import { z } from "zod";

export const SaveMemoryArgsSchema = z.object({
  content: z.string().min(1),
  type: MemoryTypeSchema,
  tags: z.array(z.string()).optional(),
  global: z.boolean().optional(),
});

export const UpdateMemoryArgsSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
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
});

export const MigrateArgsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("list") }),
  z.object({ mode: z.literal("run"), name: z.string().min(1) }),
]);

export const PinMemoryArgsSchema = z.object({
  id: z.string().min(1),
});
