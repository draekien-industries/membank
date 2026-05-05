import { MEMORY_TYPE_VALUES } from "@membank/core";
import { z } from "zod";

export const MemoryTypeSchema = z.enum(MEMORY_TYPE_VALUES);

export const SETUP_HARNESS_VALUES = ["claude-code", "copilot", "codex", "opencode"] as const;
export const SetupHarnessSchema = z.enum(SETUP_HARNESS_VALUES);

const INJECTION_HARNESS_VALUES = ["claude-code", "copilot-cli", "codex", "opencode"] as const;
export const InjectionHarnessSchema = z.enum(INJECTION_HARNESS_VALUES);

export const MigrateModeSchema = z.enum(["list", "run"]);

export const LimitSchema = z.coerce.number().int().positive();
export const PortSchema = z.coerce.number().int().min(1).max(65535);
export const OptionalNumberSchema = z.number().optional().catch(undefined);

export const TagsRowSchema = z.array(z.string());

export const MutableJsonObjectSchema = z.record(z.string(), z.unknown());
export const MaybeJsonObjectSchema = z.record(z.string(), z.unknown()).optional().catch(undefined);

export const ExportRecordSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  type: MemoryTypeSchema,
  tags: z.array(z.string()).optional().default([]),
  sourceHarness: z.string().nullable().optional().default(null),
  accessCount: z.number().optional().default(0),
  pinned: z.boolean().optional().default(false),
  needsReview: z.boolean().optional().default(false),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  embedding: z.string().nullable().optional().default(null),
});

export const ExportFileSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().optional(),
  memories: z.array(ExportRecordSchema),
});
