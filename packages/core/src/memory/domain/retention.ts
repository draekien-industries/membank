import type { Durability, Memory, MemoryType } from "../../schemas.js";
import type { Thresholds } from "./thresholds.js";

// Deliberately mirrors the shape of query/domain/scoring.ts without sharing a function:
// retrieval ranking answers "which of these matches the query", retention answers
// "should this exist at all".
const TYPE_WEIGHTS = {
  correction: 1.0,
  preference: 0.8,
  decision: 0.6,
  learning: 0.4,
  fact: 0.2,
} satisfies Record<MemoryType, number>;

// A durable gotcha never rots out; an unreferenced project decision eventually surfaces.
// Null durability predates the admission gate and takes the `stable` ramp rather than a
// backfilled guess.
const IDLE_RAMP_DAYS: Record<Durability, number> = {
  permanent: Number.POSITIVE_INFINITY,
  stable: 180,
  volatile: 30,
};

export function idlePenalty(daysIdle: number, durability: Durability | null): number {
  const ramp = IDLE_RAMP_DAYS[durability ?? "stable"];
  if (!Number.isFinite(ramp)) return 0;
  return Math.min(1, Math.max(0, daysIdle) / ramp);
}

export function computeRetention(memory: Memory, now: number): number {
  const typeWeight = TYPE_WEIGHTS[memory.type];
  const useNorm = memory.accessCount / (memory.accessCount + 10);
  const corroborationNorm = memory.corroborationCount / (memory.corroborationCount + 3);
  const daysIdle = (now - new Date(memory.updatedAt).getTime()) / 86_400_000;
  const idle = idlePenalty(daysIdle, memory.durability);

  return typeWeight * 0.4 + useNorm * 0.3 + corroborationNorm * 0.2 - idle * 0.3;
}

// Keyed off createdAt, not updatedAt: re-affirming an old memory must not restart its
// grace period. A new memory has no retrievals and no corroboration by definition, so
// without this gate the score alone would condemn a fact (0.08) the day it is written.
export function isWithinRetentionGrace(memory: Memory, now: number, graceDays: number): boolean {
  const daysOld = (now - new Date(memory.createdAt).getTime()) / 86_400_000;
  return daysOld < graceDays;
}

export function isLowRetention(memory: Memory, now: number, thresholds: Thresholds): boolean {
  if (memory.pinned) return false;
  if (isWithinRetentionGrace(memory, now, thresholds.retentionGraceDays)) return false;
  return computeRetention(memory, now) < thresholds.retentionFloor;
}
