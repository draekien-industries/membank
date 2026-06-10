import type { RegisteredRouter, ValidateLinkOptions } from "@tanstack/react-router";
import { Fragment } from "react";
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

interface ProjectCardHeroProps<
  TRouter extends RegisteredRouter = RegisteredRouter,
  TOptions = unknown,
> {
  projectId: string;
  projectName: string;
  linkOptions: ValidateLinkOptions<TRouter, TOptions>;
}

export function ProjectCardHero<TRouter extends RegisteredRouter, TOptions>(
  props: ProjectCardHeroProps<TRouter, TOptions>
): React.ReactNode;
export function ProjectCardHero({
  projectId,
  projectName,
  linkOptions,
}: ProjectCardHeroProps): React.ReactNode {
  const { stats, activity, activityLoading, days, setDays, statItems } = useProjectCardData({
    projectId,
  });

  return (
    <AppLink {...linkOptions} className="block">
      <Card className="gap-0 py-0 cursor-pointer transition-colors hover:border-foreground/20 ring-1 ring-inset ring-primary/40">
        <CardHeader className="items-center pt-4 pb-3">
          <CardTitle className="font-mono text-sm font-medium">{projectName}</CardTitle>
          <CardAction>
            <DayToggle days={days} onDaysChange={setDays} />
          </CardAction>
        </CardHeader>

        <CardContent className="pb-3 pt-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {statItems.map((item, i) => (
              <Fragment key={item.label}>
                {i > 0 && (
                  <span className="text-border font-mono select-none" aria-hidden>
                    ·
                  </span>
                )}
                <span className="flex items-baseline gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">
                    {item.label}
                  </span>
                  <span className="text-sm font-mono font-medium text-foreground">
                    {item.value}
                  </span>
                </span>
              </Fragment>
            ))}
          </div>
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
