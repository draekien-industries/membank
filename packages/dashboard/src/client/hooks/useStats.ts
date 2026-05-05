import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { memoriesCollection } from "@/lib/collections";
import type { MemoryType, Stats } from "@/lib/types";

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
    let needsReview = 0;
    for (const m of allMemories) {
      const t = m.type as MemoryType;
      if (t in byType) byType[t]++;
      if (m.reviewEvents.length > 0) needsReview++;
    }
    return { byType, total: allMemories.length, needsReview };
  }, [allMemories, isLoading]);
}
