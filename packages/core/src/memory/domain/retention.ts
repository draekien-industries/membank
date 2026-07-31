import type { Durability, Memory, MemoryType } from "../../schemas.js";

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

export const RETENTION_FLOOR = 0.3;

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

export function isLowRetention(memory: Memory, now: number): boolean {
  if (memory.pinned) return false;
  return computeRetention(memory, now) < RETENTION_FLOOR;
}
