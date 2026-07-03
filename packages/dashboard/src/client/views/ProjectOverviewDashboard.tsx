import { GLOBAL_SCOPE_HASH } from "@membank/core/client";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { ActivityEventRow } from "@/components/ActivityEventRow";
import { AppLink } from "@/components/AppLink";
import { CompositionBar } from "@/components/CompositionBar";
import { ProjectActionsMenu } from "@/components/ProjectActionsMenu";
import { Sparkline } from "@/components/Sparkline";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivityEvents } from "@/hooks/useActivityEvents";
import { useProjectActivity } from "@/hooks/useProjectActivity";
import type { ProjectRow } from "@/hooks/useProjectRows";
import { memoriesCollection } from "@/lib/collections";
import { typeColorVariants } from "@/lib/typeColors";
import type { MemoryType, Project, Synthesis } from "@/lib/types";
import { MEMORY_TYPES } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

// --- Hooks ---

function useOverviewLastActive(scope: string): string | null {
  const { events } = useActivityEvents({ scope, limit: 1 });
  return events[0]?.createdAt ?? null;
}

interface PinnedCounts {
  pinnedGlobal: number;
  pinnedProject: number;
}

function usePinnedCounts(projectId: string): PinnedCounts {
  const { data: allMemories = [] } = useLiveQuery((q) => q.from({ m: memoriesCollection }), []);
  return useMemo(
    () => ({
      pinnedGlobal: allMemories.filter((m) => m.pinned && m.projects.length === 0).length,
      pinnedProject: allMemories.filter(
        (m) => m.pinned && m.projects.some((p) => p.id === projectId)
      ).length,
    }),
    [allMemories, projectId]
  );
}

// --- Components ---

export function OverviewHeader({ project }: { project: Project }) {
  const lastActiveAt = useOverviewLastActive(project.scopeHash);
  const navigate = useNavigate();
  return (
    <div className="flex items-start justify-between gap-4 pb-6 border-b border-border">
      <div className="min-w-0 space-y-0.5">
        <h2 className="font-heading text-base font-semibold text-foreground truncate">
          {project.name}
        </h2>
        <p className="font-mono text-[10px] text-muted-foreground/50 truncate">
          {project.scopeHash}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {lastActiveAt && (
          <span className="mt-0.5 font-mono text-[11px] text-muted-foreground/50">
            active {formatRelativeTime(lastActiveAt)}
          </span>
        )}
        {project.scopeHash !== GLOBAL_SCOPE_HASH && (
          <ProjectActionsMenu project={project} onProjectRemoved={() => navigate({ to: "/" })} />
        )}
      </div>
    </div>
  );
}

export function CompositionBars({
  projectId,
  counts,
}: {
  projectId: string;
  counts: Record<MemoryType, number>;
}) {
  const total = MEMORY_TYPES.reduce((s, t) => s + counts[t], 0);
  const bars =
    total === 0
      ? []
      : MEMORY_TYPES.map((type) => ({
          type,
          count: counts[type],
          pct: Math.round((counts[type] / total) * 100),
        }))
          .filter((b) => b.count > 0)
          .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-3">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Composition</span>
      {bars.length === 0 ? (
        <p className="font-mono text-[11px] text-muted-foreground/40">No memories yet.</p>
      ) : (
        <div className="space-y-3">
          <CompositionBar counts={counts} className="h-1.5" />
          <div>
            {bars.map(({ type, count, pct }) => (
              <AppLink
                key={type}
                to="/$projectId"
                params={{ projectId }}
                search={(prev) => ({ ...prev, tab: "memories", type })}
                className="group flex w-full items-center justify-between py-1 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn("size-2 rounded-full", typeColorVariants({ type, tone: "bg" }))}
                  />
                  <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
                    {type}
                  </span>
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-foreground/70">{count}</span>
                  <span className="font-mono text-[10px] text-muted-foreground/40 w-7 text-right">
                    {pct}%
                  </span>
                </span>
              </AppLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface OverviewKpiStripProps {
  project: Project;
  row: ProjectRow;
  synthesis: Synthesis | null;
  isStale: boolean;
  isStuck: boolean;
  isLoading: boolean;
}

function KpiCell({
  label,
  value,
  valueClassName,
  context,
  contextClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  context: ReactNode;
  contextClassName?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-medium font-mono tabular-nums", valueClassName)}>
        {value}
      </div>
      <div className={cn("text-[11px] font-mono text-muted-foreground", contextClassName)}>
        {context}
      </div>
    </div>
  );
}

export function OverviewKpiStrip({
  project,
  row,
  synthesis,
  isStale,
  isStuck,
  isLoading,
}: OverviewKpiStripProps) {
  const { total, newInWindow: recentCount, flaggedCount } = row;
  const { pinnedGlobal, pinnedProject } = usePinnedCounts(project.id);

  const isInFlight = synthesis?.inFlightSince != null;
  const synthesizedAt = synthesis?.synthesizedAt ?? null;
  const synthLine = getSynthLine({ synthesis, isLoading, isInFlight, isStuck, isStale });

  const pinnedTotal = pinnedGlobal + pinnedProject;
  const pinnedParts = [
    pinnedGlobal > 0 && `${pinnedGlobal} global`,
    pinnedProject > 0 && `${pinnedProject} here`,
  ].filter(Boolean);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4">
      <KpiCell
        label="Memories"
        value={total}
        context={recentCount > 0 ? `+${recentCount} · 30d` : "no new · 30d"}
      />
      {flaggedCount > 0 ? (
        <AppLink to="/review" search={{ projectId: project.id }} className="group block">
          <KpiCell
            label="Flagged"
            value={flaggedCount}
            valueClassName="text-destructive"
            context={
              <>
                review{" "}
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </>
            }
          />
        </AppLink>
      ) : (
        <KpiCell
          label="Flagged"
          value="0"
          valueClassName="text-muted-foreground"
          context="nothing flagged"
          contextClassName="text-muted-foreground/40"
        />
      )}
      <KpiCell
        label="Pinned"
        value={pinnedTotal}
        valueClassName={pinnedTotal === 0 ? "text-muted-foreground" : undefined}
        context={pinnedParts.length > 0 ? pinnedParts.join(" · ") : "—"}
      />
      <KpiCell
        label="Synthesis"
        value={synthLine.text}
        valueClassName={synthLine.className}
        context={synthesizedAt ? formatRelativeTime(synthesizedAt) : "—"}
      />
    </div>
  );
}

function getSynthLine({
  synthesis,
  isLoading,
  isInFlight,
  isStuck,
  isStale,
}: {
  synthesis: Synthesis | null;
  isLoading: boolean;
  isInFlight: boolean;
  isStuck: boolean;
  isStale: boolean;
}): { text: string; className: string } {
  if (isLoading && !synthesis) return { text: "loading…", className: "text-muted-foreground/40" };
  if (isStuck) return { text: "stuck", className: "text-destructive" };
  if (isInFlight) return { text: "synthesizing…", className: "text-muted-foreground/50" };
  if (isStale) return { text: "stale", className: "text-stale" };
  if (!synthesis) return { text: "none", className: "text-muted-foreground/40" };
  return { text: "fresh", className: "text-muted-foreground/70" };
}

export function RecentActivityList({ scope, projectId }: { scope: string; projectId?: string }) {
  const { events, loading } = useActivityEvents({ scope, limit: 4 });

  return (
    <div className="space-y-3">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Recent Activity
      </span>
      {loading && <p className="font-mono text-[11px] text-muted-foreground/40">Loading…</p>}
      {!loading && events.length === 0 && (
        <p className="font-mono text-[11px] text-muted-foreground/40">No recent activity.</p>
      )}
      {events.length > 0 && (
        <div>
          <ul className="-mx-4 border-t border-border/50">
            {events.map((event) => (
              <ActivityEventRow key={event.id} event={event} projectId={projectId} />
            ))}
          </ul>
          <AppLink
            from="/$projectId"
            search={(prev) => ({ ...prev, tab: "activity" })}
            className="mt-2 font-mono text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            view all →
          </AppLink>
        </div>
      )}
    </div>
  );
}

export function ActivityTrend({ projectId }: { projectId: string }) {
  const { activity, loading } = useProjectActivity(projectId, 30);
  const eventCount = useMemo(() => activity.reduce((s, d) => s + d.count, 0), [activity]);

  return (
    <div className="space-y-3">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Activity · 30d
      </span>
      {loading ? (
        <Skeleton className="h-8 w-full" />
      ) : (
        <>
          <Sparkline activity={activity} days={30} className="h-8 w-full" />
          <p className="font-mono text-[11px] text-muted-foreground">
            {eventCount > 0 ? `${eventCount} events · 30d` : "no activity · 30d"}
          </p>
        </>
      )}
    </div>
  );
}
