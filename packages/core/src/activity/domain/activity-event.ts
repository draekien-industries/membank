import { z } from "zod";

export const ACTIVITY_EVENT_TYPE_VALUES = [
  "memory.created",
  "memory.updated",
  "memory.deleted",
  "memory.flagged",
  "memory.queried",
] as const;

export const ActivityEventTypeSchema = z.enum(ACTIVITY_EVENT_TYPE_VALUES);
export type ActivityEventType = z.infer<typeof ActivityEventTypeSchema>;

export const RETENTION_DAYS = 30;

export interface ActivityEvent {
  id: string;
  projectHash: string;
  eventType: ActivityEventType;
  memoryId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityEventInput {
  projectHash: string;
  eventType: ActivityEventType;
  memoryId?: string;
  payload?: Record<string, unknown>;
}
