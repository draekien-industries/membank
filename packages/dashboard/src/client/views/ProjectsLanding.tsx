import { GLOBAL_SCOPE_HASH } from "@membank/core/client";
import { useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";
import { AppLink } from "@/components/AppLink";
import { CompositionBar } from "@/components/CompositionBar";
import { type DaysOption, DayToggle } from "@/components/DayToggle";
import { OrphanBanner } from "@/components/OrphanBanner";
import { ProjectActionsMenu } from "@/components/ProjectActionsMenu";
import { Sparkline } from "@/components/Sparkline";
import { StopPropagation } from "@/components/StopPropagation";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectActivity } from "@/hooks/useProjectActivity";
import { type ProjectRow, useProjectRows } from "@/hooks/useProjectRows";
import { projectsCollection } from "@/lib/collections";
import { cn, formatRelativeTime } from "@/lib/utils";

const ROW_GRID =
  "grid grid-cols-[minmax(0,1.5fr)_5.5rem_6.5rem_1fr] md:grid-cols-[minmax(0,1.5fr)_5.5rem_7rem_7rem_4.5rem_6rem_2rem] items-center gap-x-4";

function ProjectActivityCell({ projectId, days }: { projectId: string; days: DaysOption }) {
  const { activity, loading } = useProjectActivity(projectId, days);
  if (loading) return <Skeleton className="h-5 w-full" />;
  return <Sparkline activity={activity} days={days} className="h-5 w-full" />;
}

function TableHeaderRow({ days }: { days: DaysOption }) {
  return (
    <div className={cn(ROW_GRID, "px-3 pb-2 border-b border-border")}>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Name</span>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground text-right">
        Memories
      </span>
      <span className="hidden md:block text-[11px] uppercase tracking-wide text-muted-foreground">
        Composition
      </span>
      <span className="hidden md:block text-[11px] uppercase tracking-wide text-muted-foreground">
        Activity · {days}d
      </span>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground text-right">
        Flagged
      </span>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground text-right">
        Updated
      </span>
      <span aria-hidden />
    </div>
  );
}

function ProjectRowCells({ row, days }: { row: ProjectRow; days: DaysOption }) {
  const { project, total, byType, newInWindow, flaggedCount, lastUpdated } = row;
  return (
    <>
      <span className="text-xs font-mono text-foreground truncate">{project.name}</span>

      <span className="flex items-baseline justify-end gap-1">
        <span className="text-sm font-medium text-foreground">{total}</span>
        {newInWindow > 0 && (
          <span className="text-[10px] text-muted-foreground">{`+${newInWindow}`}</span>
        )}
      </span>

      <span className="hidden md:block">
        <CompositionBar counts={byType} className="h-1" />
      </span>

      <span className="hidden md:block">
        <ProjectActivityCell projectId={project.id} days={days} />
      </span>

      <span className="text-right">
        {flaggedCount === 0 ? (
          <span className="text-xs text-muted-foreground/30">—</span>
        ) : (
          <span className="text-xs font-medium text-destructive">{flaggedCount}</span>
        )}
      </span>

      <span className="text-right text-[11px] text-muted-foreground">
        {lastUpdated ? formatRelativeTime(lastUpdated) : <span className="opacity-30">—</span>}
      </span>

      <span className="hidden md:flex justify-end">
        <StopPropagation>
          <span className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
            <ProjectActionsMenu project={project} />
          </span>
        </StopPropagation>
      </span>
    </>
  );
}

export function ProjectsLanding() {
  const [days, setDays] = useState<DaysOption>(30);
  const { data: projects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);

  const allRows = useProjectRows(projects, days);
  const globalRow = allRows.find((r) => r.project.scopeHash === GLOBAL_SCOPE_HASH);
  const rows = allRows.filter((r) => r.project.scopeHash !== GLOBAL_SCOPE_HASH);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <OrphanBanner />

      {globalRow && (
        <section className="space-y-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">
            Inherited by all projects
          </span>
          <AppLink
            to="/$projectId"
            params={{ projectId: globalRow.project.id }}
            className={cn(ROW_GRID, "group bg-card rounded-md border border-border px-3 py-2.5")}
          >
            <ProjectRowCells row={globalRow} days={days} />
          </AppLink>
        </section>
      )}

      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-sm font-mono font-medium text-foreground">Projects</h1>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-muted-foreground">
              {rows.length} project{rows.length !== 1 ? "s" : ""}
            </span>
            <DayToggle days={days} onDaysChange={setDays} />
          </div>
        </header>

        {rows.length === 0 ? (
          <Empty>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Memories are associated with projects automatically as your AI tools work in different
              repositories.
            </EmptyDescription>
          </Empty>
        ) : (
          <div>
            <TableHeaderRow days={days} />
            <ul>
              {rows.map((row) => (
                <li key={row.project.id}>
                  <AppLink
                    to="/$projectId"
                    params={{ projectId: row.project.id }}
                    className={cn(
                      ROW_GRID,
                      "group px-3 py-2.5 border-b border-border hover:bg-accent/40 transition-colors"
                    )}
                  >
                    <ProjectRowCells row={row} days={days} />
                  </AppLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
