import type { ActivityDay } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SparklineProps {
  activity: ActivityDay[];
  days: number;
  className?: string;
}

const BAR_WIDTH = 2;
const BAR_STEP = 3;
const VIEWBOX_HEIGHT = 24;
const BAR_MAX_HEIGHT = 22;
const MIN_VISIBLE_HEIGHT = 4;
const ZERO_STUB_HEIGHT = 1.5;

function buildDailySeries(activity: ActivityDay[], days: number): ActivityDay[] {
  const activityMap = new Map(activity.map((a) => [a.date, a.count]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const series: ActivityDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    series.push({ date, count: activityMap.get(date) ?? 0 });
  }
  return series;
}

export function Sparkline({ activity, days, className }: SparklineProps) {
  const series = buildDailySeries(activity, days);
  const maxCount = Math.max(...series.map((d) => d.count), 0);
  const total = series.reduce((sum, d) => sum + d.count, 0);
  const label = `${total} ${total === 1 ? "memory" : "memories"} in the last ${days} days`;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${days * BAR_STEP} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("block", className)}
    >
      <title>{label}</title>
      {series.map(({ date, count }, i) => {
        const height =
          count === 0
            ? ZERO_STUB_HEIGHT
            : Math.max(MIN_VISIBLE_HEIGHT, maxCount > 0 ? (count / maxCount) * BAR_MAX_HEIGHT : 0);
        return (
          <rect
            key={date}
            x={i * BAR_STEP}
            y={VIEWBOX_HEIGHT - height}
            width={BAR_WIDTH}
            height={height}
            rx={0.5}
            fill={count === 0 ? "var(--color-border)" : "var(--color-primary)"}
            fillOpacity={count === 0 ? 1 : 0.7}
          />
        );
      })}
    </svg>
  );
}
