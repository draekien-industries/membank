import type { RegisteredRouter, ValidateLinkOptions } from "@tanstack/react-router";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { AppLink } from "@/components/AppLink";
import { DayToggle } from "@/components/DayToggle";
import { StopPropagation } from "@/components/StopPropagation";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CardFooterStatus, useProjectCardData } from "@/hooks/useProjectCardData";
import type { ProjectStats } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProjectCardProps<
  TRouter extends RegisteredRouter = RegisteredRouter,
  TOptions = unknown,
> {
  projectId: string;
  projectName: string;
  linkOptions: ValidateLinkOptions<TRouter, TOptions>;
  statsOverride?: ProjectStats;
  className?: string;
  actions?: React.ReactNode;
}

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

export function ProjectCard<TRouter extends RegisteredRouter, TOptions>(
  props: ProjectCardProps<TRouter, TOptions>
): React.ReactNode;
export function ProjectCard({
  projectId,
  projectName,
  linkOptions,
  statsOverride,
  className,
  actions,
}: ProjectCardProps): React.ReactNode {
  const { stats, activity, activityLoading, days, setDays, statItems } = useProjectCardData({
    projectId,
    statsOverride,
  });

  return (
    <AppLink {...linkOptions} className="block">
      <Card
        className={cn(
          "gap-0 py-0 cursor-pointer transition-colors hover:border-foreground/20",
          className
        )}
      >
        <CardHeader className="items-center pt-4 pb-3">
          <CardTitle className="font-mono text-sm font-medium">{projectName}</CardTitle>
          <CardAction>
            <div className="flex items-center gap-1">
              <DayToggle days={days} onDaysChange={setDays} />
              {actions}
            </div>
          </CardAction>
        </CardHeader>

        <CardContent className="grid grid-cols-4 gap-4 pb-3 pt-0">
          {statItems.map((item) => (
            <StatCell key={item.label} label={item.label}>
              {item.value}
            </StatCell>
          ))}
        </CardContent>

        <StopPropagation preventDefault>
          <CardContent className="overflow-hidden pb-3 pt-0">
            {activityLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <ActivityHeatmap activity={activity} days={days} />
            )}
          </CardContent>
        </StopPropagation>

        <CardFooter className="pb-4 pt-0">
          <CardFooterStatus stats={stats} />
        </CardFooter>
      </Card>
    </AppLink>
  );
}
