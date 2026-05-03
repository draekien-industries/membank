import { forwardRef } from "react";
import { Badge } from "@/components/ui/badge";
import type { Stats } from "@/lib/types";
import { MEMORY_TYPES } from "@/lib/types";
import { capitalize } from "@/lib/utils";

interface StatsBarProps {
  stats: Stats | null;
}

export const StatsBar = forwardRef<HTMLDivElement, StatsBarProps>(function StatsBar(
  { stats },
  ref
) {
  if (!stats) return null;

  return (
    <div ref={ref} className="flex items-center gap-3 text-muted-foreground">
      <span className="text-xs">{stats.total} memories</span>
      <span className="text-border">·</span>
      <div className="flex items-center gap-1.5">
        {MEMORY_TYPES.map((type) => {
          const count = stats.byType[type];
          if (!count) return null;
          return (
            <Badge key={type} variant={type}>
              {capitalize(type)} {count}
            </Badge>
          );
        })}
      </div>
      {stats.needsReview > 0 && (
        <>
          <span className="text-border">·</span>
          <Badge variant="destructive">{stats.needsReview} to review</Badge>
        </>
      )}
    </div>
  );
});
