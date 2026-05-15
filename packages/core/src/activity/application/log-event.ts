import { randomUUID } from "node:crypto";
import type { ActivityEventInput } from "../domain/activity-event.js";
import { RETENTION_DAYS } from "../domain/activity-event.js";
import type { ActivityRepository } from "../ports.js";

export function logEvent(input: ActivityEventInput, repo: ActivityRepository): void {
  const now = new Date();
  const createdAt = now.toISOString();

  repo.insert({
    id: randomUUID(),
    projectHash: input.projectHash,
    eventType: input.eventType,
    memoryId: input.memoryId ?? null,
    payload: input.payload ?? {},
    createdAt,
  });

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  repo.prune(cutoff.toISOString());
}
