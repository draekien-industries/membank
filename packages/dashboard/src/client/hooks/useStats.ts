import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { memoriesCollection } from "@/lib/collections";
import type { MemoryType, Stats } from "@/lib/types";

type ReviewEventLike = { resolvedAt: string | null; conflictingMemoryId: string | null };
type MemoryLike = { id: string; reviewEvents: ReviewEventLike[] };

export function countReviewClusters(memories: MemoryLike[]): number {
  const allIds = new Set(memories.map((m) => m.id));
  const parent = new Map<string, string>();

  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };

  const flagged = new Set<string>();

  for (const m of memories) {
    for (const e of m.reviewEvents) {
      if (e.resolvedAt !== null) continue;
      flagged.add(m.id);
      if (e.conflictingMemoryId !== null && allIds.has(e.conflictingMemoryId)) {
        const ra = find(m.id);
        const rb = find(e.conflictingMemoryId);
        if (ra !== rb) parent.set(ra, rb);
      }
    }
  }

  const memoryById = new Map(memories.map((m) => [m.id, m]));
  const activeRoots = new Set<string>();
  let staleCount = 0;

  for (const id of flagged) {
    const m = memoryById.get(id);
    if (m === undefined) continue;
    const hasLivingConflict = m.reviewEvents.some(
      (e) =>
        e.resolvedAt === null && e.conflictingMemoryId !== null && allIds.has(e.conflictingMemoryId)
    );
    if (hasLivingConflict) {
      activeRoots.add(find(id));
    } else {
      staleCount++;
    }
  }

  return activeRoots.size + staleCount;
}

export function useStats(): Stats | null {
  const { data: allMemories = [], isLoading } = useLiveQuery(
    (q) => q.from({ m: memoriesCollection }),
    []
  );

  return useMemo<Stats | null>(() => {
    if (isLoading) return null;
    const byType = {
      correction: 0,
      preference: 0,
      decision: 0,
      learning: 0,
      fact: 0,
    } as Record<MemoryType, number>;
    for (const m of allMemories) {
      const t = m.type as MemoryType;
      if (t in byType) byType[t]++;
    }
    return {
      byType,
      total: allMemories.length,
      needsReview: countReviewClusters(allMemories),
    };
  }, [allMemories, isLoading]);
}
