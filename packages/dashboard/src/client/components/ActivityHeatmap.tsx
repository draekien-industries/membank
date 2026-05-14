import React, { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ActivityDay } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ActivityHeatmapProps {
  activity: ActivityDay[];
  days: 365 | 30 | 7;
}

interface HeatmapCell {
  date: string;
  count: number;
  inRange: boolean;
}

function buildHeatmapGrid(activity: ActivityDay[], days: number): HeatmapCell[][] {
  const activityMap = new Map(activity.map((a) => [a.date, a.count]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rangeStart = new Date(today);
  rangeStart.setDate(today.getDate() - days + 1);

  const dow = rangeStart.getDay();
  const toMonday = dow === 0 ? 6 : dow - 1;
  const gridStart = new Date(rangeStart);
  gridStart.setDate(rangeStart.getDate() - toMonday);

  const weeks: HeatmapCell[][] = [];
  const cur = new Date(gridStart);
  while (cur <= today) {
    const week: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = cur.toISOString().slice(0, 10);
      week.push({
        date: dateStr,
        count: activityMap.get(dateStr) ?? 0,
        inRange: cur >= rangeStart && cur <= today,
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function cellColorClass(count: number): string {
  if (count === 0) return "bg-muted";
  if (count <= 3) return "bg-primary/20";
  if (count <= 7) return "bg-primary/40";
  if (count <= 15) return "bg-primary/65";
  return "bg-primary/85";
}

function formatTooltip(date: string, count: number): string {
  const label = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const noun = count === 1 ? "memory" : "memories";
  return `${label} · ${count} ${noun}`;
}

interface HeatmapCellItemProps {
  cell: HeatmapCell;
}

const HeatmapCellItem = React.memo(function HeatmapCellItem({ cell }: HeatmapCellItemProps) {
  const base = cn(
    "w-1.5 h-1.5 rounded-[2px]",
    cellColorClass(cell.count),
    !cell.inRange && "opacity-30"
  );

  if (!cell.inRange) {
    return <div className={base} />;
  }

  return (
    <Tooltip>
      <TooltipTrigger>
        <div className={base} />
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-mono text-[11px]">{formatTooltip(cell.date, cell.count)}</span>
      </TooltipContent>
    </Tooltip>
  );
});

export function ActivityHeatmap({ activity, days }: ActivityHeatmapProps) {
  const weeks = useMemo(() => buildHeatmapGrid(activity, days), [activity, days]);

  return (
    <TooltipProvider>
      <div className="flex gap-[1px]">
        {weeks.map((week) => (
          <div key={week[0]?.date ?? week.length} className="flex flex-col gap-[1px]">
            {week.map((cell) => (
              <HeatmapCellItem key={cell.date} cell={cell} />
            ))}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
