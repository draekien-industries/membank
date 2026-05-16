import { useMemo, useState } from "react";
import type { DaysOption } from "@/components/DayToggle";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectActivity } from "@/hooks/useProjectActivity";
import { useProjectStats } from "@/hooks/useProjectStats";
import type { MemoryType, ProjectStats } from "@/lib/types";
import { capitalize, formatRelativeTime } from "@/lib/utils";

export type { DaysOption } from "@/components/DayToggle";

const TYPE_COLORS: Record<MemoryType, string> = {
  correction: "var(--type-correction, oklch(0.65 0.18 50))",
  preference: "var(--type-preference, oklch(0.60 0.14 240))",
  decision: "var(--type-decision, oklch(0.60 0.14 290))",
  learning: "var(--type-learning, oklch(0.55 0.14 165))",
  fact: "var(--type-fact, oklch(0.60 0.008 165))",
};

export interface StatItem {
  label: string;
  value: React.ReactNode;
}

interface CardFooterStatusProps {
  stats: ProjectStats | null;
}

export function CardFooterStatus({ stats }: CardFooterStatusProps) {
  if (!stats) return null;
  const reviewCount = stats.needsReview;
  if (reviewCount > 0)
    return (
      <span className="text-[11px] text-muted-foreground font-mono">
        {reviewCount} {reviewCount === 1 ? "memory" : "memories"} flagged for review
      </span>
    );
  if (stats.lastActive)
    return (
      <span className="text-[11px] text-muted-foreground font-mono">
        Last active {formatRelativeTime(stats.lastActive)}
      </span>
    );
  return <span className="text-[11px] text-muted-foreground font-mono">No activity yet</span>;
}

interface UseProjectCardDataOptions {
  projectId: string;
  statsOverride?: ProjectStats;
}

export function useProjectCardData({ projectId, statsOverride }: UseProjectCardDataOptions) {
  const [days, setDays] = useState<DaysOption>(30);

  const { stats: fetchedStats, loading: statsLoading } = useProjectStats(
    statsOverride ? null : projectId
  );
  const stats = statsOverride ?? fetchedStats;
  const loading = statsOverride ? false : statsLoading;

  const { activity, loading: activityLoading } = useProjectActivity(projectId, days);

  const statItems: StatItem[] = useMemo(
    () => [
      {
        label: "Total",
        value: loading ? <Skeleton className="h-3 w-8" /> : (stats?.total ?? 0),
      },
      {
        label: "Active Days",
        value: loading ? <Skeleton className="h-3 w-8" /> : (stats?.activeDays ?? 0),
      },
      {
        label: "Pinned",
        value: loading ? <Skeleton className="h-3 w-8" /> : (stats?.pinned ?? 0),
      },
      {
        label: "Most Common",
        value: loading ? (
          <Skeleton className="h-3 w-8" />
        ) : stats?.mostCommonType ? (
          <span style={{ color: TYPE_COLORS[stats.mostCommonType] }}>
            {capitalize(stats.mostCommonType)}
          </span>
        ) : (
          "—"
        ),
      },
    ],
    [loading, stats]
  );

  return {
    stats,
    statsLoading: loading,
    activity,
    activityLoading,
    days,
    setDays,
    statItems,
  };
}
