import type { Memory, MemoryType } from "../../memory/domain/memory.js";

const TYPE_WEIGHTS = {
  correction: 1.0,
  preference: 0.8,
  decision: 0.6,
  learning: 0.4,
  fact: 0.2,
} satisfies Record<MemoryType, number>;

export function computeScore(memory: Memory, cosineSim: number, now: number): number {
  const typeWeight = TYPE_WEIGHTS[memory.type];
  const accessCountNorm = memory.accessCount / (memory.accessCount + 10);
  const daysSinceUpdate = (now - new Date(memory.updatedAt).getTime()) / 86400000;
  const recencyNorm = 1 / (1 + daysSinceUpdate);
  const pinned = memory.pinned ? 1.0 : 0.0;
  return (
    cosineSim * 0.4 + typeWeight * 0.25 + accessCountNorm * 0.2 + recencyNorm * 0.1 + pinned * 0.05
  );
}
