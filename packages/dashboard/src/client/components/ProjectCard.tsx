import { cva } from "class-variance-authority";
import { useState } from "react";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectActivity } from "@/hooks/useProjectActivity";
import { useProjectStats } from "@/hooks/useProjectStats";
import type { MemoryType, ProjectStats } from "@/lib/types";
import { capitalize, cn, formatRelativeTime, truncate } from "@/lib/utils";

interface ProjectCardProps {
  projectId: string;
  projectName: string;
  href: string;
  statsOverride?: ProjectStats;
  className?: string;
}

const TYPE_COLORS: Record<MemoryType, string> = {
  correction: "var(--type-correction, oklch(0.65 0.18 50))",
  preference: "var(--type-preference, oklch(0.60 0.14 240))",
  decision: "var(--type-decision, oklch(0.60 0.14 290))",
  learning: "var(--type-learning, oklch(0.55 0.14 165))",
  fact: "var(--type-fact, oklch(0.60 0.008 165))",
};

type DaysOption = 365 | 30 | 7;

const DAY_OPTIONS = [365, 30, 7] as const satisfies readonly DaysOption[];

const dayToggleVariants = cva("text-[11px] font-mono px-1.5 py-0.5 rounded transition-colors", {
  variants: {
    active: {
      true: "bg-muted text-foreground",
      false: "text-muted-foreground hover:text-foreground",
    },
  },
  defaultVariants: { active: false },
});

interface StatCellProps {
  label: string;
  children: React.ReactNode;
}

function StatCell({ label, children }: StatCellProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">
        {label}
      </span>
      <div className="text-sm font-mono font-medium text-foreground">{children}</div>
    </div>
  );
}

export function ProjectCard({
  projectId,
  projectName,
  href,
  statsOverride,
  className,
}: ProjectCardProps) {
  const [days, setDays] = useState<DaysOption>(365);

  const { stats: fetchedStats, loading: statsLoading } = useProjectStats(
    statsOverride ? null : projectId
  );
  const stats = statsOverride ?? fetchedStats;
  const loading = statsOverride ? false : statsLoading;

  const { activity, loading: activityLoading } = useProjectActivity(projectId, days);

  const reviewCount = stats?.needsReview ?? 0;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card hover:bg-muted/20 transition-colors",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <a
          href={href}
          className="text-sm font-medium font-mono text-foreground hover:underline underline-offset-2"
        >
          {projectName}
        </a>
        <div className="flex gap-0.5">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={dayToggleVariants({ active: days === d })}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDays(d);
              }}
            >
              {d === 365 ? "All" : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-0 px-4 pb-3">
        <StatCell label="Total">
          {loading ? <Skeleton className="h-3 w-8" /> : (stats?.total ?? 0)}
        </StatCell>
        <StatCell label="Active Days">
          {loading ? <Skeleton className="h-3 w-8" /> : (stats?.activeDays ?? 0)}
        </StatCell>
        <StatCell label="Needs Review">
          {loading ? <Skeleton className="h-3 w-8" /> : (stats?.needsReview ?? 0)}
        </StatCell>
        <StatCell label="Pinned">
          {loading ? <Skeleton className="h-3 w-8" /> : (stats?.pinned ?? 0)}
        </StatCell>
        <StatCell label="Most Common">
          {loading ? (
            <Skeleton className="h-3 w-8" />
          ) : stats?.mostCommonType ? (
            <span style={{ color: TYPE_COLORS[stats.mostCommonType] }}>
              {capitalize(stats.mostCommonType)}
            </span>
          ) : (
            "—"
          )}
        </StatCell>
        <StatCell label="Last Active">
          {loading ? (
            <Skeleton className="h-3 w-8" />
          ) : stats?.lastActive ? (
            formatRelativeTime(stats.lastActive)
          ) : (
            "—"
          )}
        </StatCell>
        <StatCell label="Harness">
          {loading ? (
            <Skeleton className="h-3 w-8" />
          ) : stats?.harness ? (
            truncate(stats.harness, 14)
          ) : (
            "—"
          )}
        </StatCell>
        <StatCell label="Corrections">
          {loading ? <Skeleton className="h-3 w-8" /> : (stats?.byType.correction ?? 0)}
        </StatCell>
      </div>

      <div className="px-4 pb-3 overflow-hidden">
        {activityLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <ActivityHeatmap activity={activity} days={days} />
        )}
      </div>

      <div className="px-4 pb-4">
        {stats ? (
          reviewCount > 0 ? (
            <span className="text-[11px] text-muted-foreground font-mono">
              {reviewCount} {reviewCount === 1 ? "memory" : "memories"} flagged for review
            </span>
          ) : stats.lastActive ? (
            <span className="text-[11px] text-muted-foreground font-mono">
              Last active {formatRelativeTime(stats.lastActive)}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground font-mono">No activity yet</span>
          )
        ) : null}
      </div>
    </div>
  );
}
