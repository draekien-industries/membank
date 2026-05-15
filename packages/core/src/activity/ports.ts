import type {
  ActivityEvent,
  ActivityEventInput,
  ActivityEventType,
} from "./domain/activity-event.js";

export interface ActivityRepository {
  insert(event: {
    id: string;
    projectHash: string;
    eventType: ActivityEventType;
    memoryId: string | null;
    payload: Record<string, unknown>;
    createdAt: string;
  }): void;
  list(filter: {
    scope?: string;
    type?: ActivityEventType;
    since?: string;
    limit?: number;
  }): ActivityEvent[];
  prune(olderThan: string): void;
}

export interface ActivityLogger {
  logEvent(input: ActivityEventInput): void;
}

export const noopActivityLogger: ActivityLogger = {
  logEvent() {},
};
