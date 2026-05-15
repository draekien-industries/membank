import type { ActivityEvent, ActivityEventType } from "../domain/activity-event.js";
import type { ActivityRepository } from "../ports.js";

export interface ListEventsFilter {
  scope?: string;
  type?: ActivityEventType;
  since?: string;
  limit?: number;
}

export function listEvents(filter: ListEventsFilter, repo: ActivityRepository): ActivityEvent[] {
  return repo.list(filter);
}
