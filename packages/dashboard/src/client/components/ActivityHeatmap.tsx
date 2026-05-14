import { cva } from "class-variance-authority";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ActivityDay } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ActivityHeatmapProps {
  activity: ActivityDay[];
  days: 30 | 14 | 7;
  className?: string;
}

interface HeatmapCell {
  date: string;
  count: number;
  inRange: boolean;
}

type CellIntensity = "zero" | "low" | "mid" | "high" | "max";

function countToIntensity(count: number): CellIntensity {
  if (count === 0) return "zero";
  if (count <= 3) return "low";
  if (count <= 7) return "mid";
  if (count <= 15) return "high";
  return "max";
}

const heatmapCellVariants = cva("w-3 h-3 rounded-[2px]", {
  variants: {
    intensity: {
      zero: "bg-muted",
      low: "bg-primary/20",
      mid: "bg-primary/40",
      high: "bg-primary/65",
      max: "bg-primary/85",
    },
    inRange: {
      true: "",
      false: "opacity-30",
    },
  },
  defaultVariants: { intensity: "zero", inRange: true },
});

const GRID_DAYS = 30;

function buildHeatmapGrid(activity: ActivityDay[], filterDays: number): HeatmapCell[][] {
  const activityMap = new Map(activity.map((a) => [a.date, a.count]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rangeStart = new Date(today);
  rangeStart.setDate(today.getDate() - filterDays + 1);

  const gridRangeStart = new Date(today);
  gridRangeStart.setDate(today.getDate() - GRID_DAYS + 1);

  const dow = gridRangeStart.getDay();
  const toMonday = dow === 0 ? 6 : dow - 1;
  const gridStart = new Date(gridRangeStart);
  gridStart.setDate(gridRangeStart.getDate() - toMonday);

  const weeks: HeatmapCell[][] = [];
  const cur = new Date(gridStart);
  while (cur <= today) {
    const week: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = cur.toISOString().slice(0, 10);
      week.push({
        date: dateStr,
        count: activityMap.get(dateStr) ?? 0,
        inRange: cur >= rangeStart,
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
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

function HeatmapCellItem({ cell }: HeatmapCellItemProps) {
  const base = heatmapCellVariants({
    intensity: countToIntensity(cell.count),
    inRange: cell.inRange,
  });

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
}

export function ActivityHeatmap({ activity, days, className }: ActivityHeatmapProps) {
  const weeks = buildHeatmapGrid(activity, days);

  return (
    <TooltipProvider>
      <div className={cn("flex gap-[2px]", className)}>
        {weeks.map((week) => (
          <div key={week[0]?.date ?? week.length} className="flex flex-col gap-[2px]">
            {week.map((cell) => (
              <HeatmapCellItem key={cell.date} cell={cell} />
            ))}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
