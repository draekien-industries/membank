export const DEFAULT_IN_FLIGHT_TIMEOUT_MS = 10 * 60_000;
export const DEFAULT_RECENT_COMPLETION_MS = 60_000;

export type ClaimDecision =
  | { kind: "claim" }
  | { kind: "skip"; reason: "in_flight" | "recently_completed" };

export interface RunSnapshot {
  startedAt: Date;
  completedAt: Date | null;
  status: "in_flight" | "completed" | "failed";
}

export function decideClaim(
  existing: RunSnapshot | undefined,
  now: Date,
  inFlightTimeoutMs: number,
  recentCompletionMs: number
): ClaimDecision {
  if (existing === undefined) return { kind: "claim" };

  if (existing.status === "in_flight") {
    const age = now.getTime() - existing.startedAt.getTime();
    if (age < inFlightTimeoutMs) return { kind: "skip", reason: "in_flight" };
    return { kind: "claim" };
  }

  if (existing.status === "completed" && existing.completedAt !== null) {
    const age = now.getTime() - existing.completedAt.getTime();
    if (age < recentCompletionMs) return { kind: "skip", reason: "recently_completed" };
  }

  return { kind: "claim" };
}
