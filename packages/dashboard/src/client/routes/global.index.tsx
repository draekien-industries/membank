import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { memoriesCollection } from "@/lib/collections";
import type { MemoryType } from "@/lib/types";
import { MEMORY_TYPES } from "@/lib/types";

export const Route = createFileRoute("/global/")({
  component: GlobalIndexPanel,
});

function GlobalIndexPanel() {
  const { data: allMemories = [] } = useLiveQuery((q) => q.from({ m: memoriesCollection }), []);

  const counts = useMemo(() => {
    const globalMemories = allMemories.filter((m) => m.projects.length === 0);
    const result = {} as Record<MemoryType, number>;
    for (const type of MEMORY_TYPES) result[type] = 0;
    for (const m of globalMemories) {
      const t = m.type as MemoryType;
      if (t in result) result[t]++;
    }
    return result;
  }, [allMemories]);

  const nonZero = MEMORY_TYPES.filter((t) => (counts[t] ?? 0) > 0);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <header>
        <h2 className="font-heading text-base font-semibold text-foreground">Global</h2>
        <p className="font-mono text-[10px] text-muted-foreground/50 mt-0.5">
          Memories not associated with any project
        </p>
      </header>
      {nonZero.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {nonZero.map((type) => (
            <Badge key={type} variant={type}>
              {counts[type]} {type}
              {counts[type] !== 1 ? "s" : ""}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
