import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { ActivityEventRow } from "@/components/ActivityEventRow";
import { AppLink } from "@/components/AppLink";
import { useActivityEvents } from "@/hooks/useActivityEvents";
import { countReviewClusters } from "@/hooks/useStats";
import { memoriesCollection } from "@/lib/collections";
import { typeColorVariants } from "@/lib/typeColors";
import type { Memory, MemoryType, Project, Synthesis } from "@/lib/types";
import { MEMORY_TYPES } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

export function countMemoriesByType(
  allMemories: Memory[],
  projectId: string
): Record<MemoryType, number> {
  const result = {} as Record<MemoryType, number>;
  for (const type of MEMORY_TYPES) result[type] = 0;
  for (const m of allMemories) {
    if (m.projects.some((p) => p.id === projectId)) result[m.type as MemoryType]++;
  }
  return result;
}

// --- Hooks ---

function useOverviewLastActive(scope: string): string | null {
  const { events } = useActivityEvents({ scope, limit: 1 });
  return events[0]?.createdAt ?? null;
}

interface CompositionBar {
  type: MemoryType;
  count: number;
  pct: number;
}

function useCompositionBars(projectId: string): CompositionBar[] {
  const { data: allMemories = [] } = useLiveQuery((q) => q.from({ m: memoriesCollection }), []);
  return useMemo(() => {
    const counts = countMemoriesByType(allMemories, projectId);
    const total = MEMORY_TYPES.reduce((s, t) => s + counts[t], 0);
    if (total === 0) return [];
    return MEMORY_TYPES.map((type) => ({
      type,
      count: counts[type],
      pct: Math.round((counts[type] / total) * 100),
    }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [allMemories, projectId]);
}

interface AttentionData {
  flaggedCount: number;
  pinnedGlobal: number;
  pinnedProject: number;
}

function useAttentionData(projectId: string): AttentionData {
  const { data: allMemories = [] } = useLiveQuery((q) => q.from({ m: memoriesCollection }), []);
  return useMemo(() => {
    const projectMemories = allMemories.filter((m) => m.projects.some((p) => p.id === projectId));
    return {
      flaggedCount: countReviewClusters(projectMemories),
      pinnedGlobal: allMemories.filter((m) => m.pinned && m.projects.length === 0).length,
      pinnedProject: allMemories.filter(
        (m) => m.pinned && m.projects.some((p) => p.id === projectId)
      ).length,
    };
  }, [allMemories, projectId]);
}

// --- Components ---

export function OverviewHeader({ project }: { project: Project }) {
  const lastActiveAt = useOverviewLastActive(project.scopeHash);
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
      {lastActiveAt && (
        <span className="shrink-0 mt-0.5 font-mono text-[11px] text-muted-foreground/50">
          active {formatRelativeTime(lastActiveAt)}
        </span>
      )}
    </div>
  );
}

export function CompositionBars({ projectId }: { projectId: string }) {
  const bars = useCompositionBars(projectId);

  return (
    <div className="space-y-3">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Composition</span>
      {bars.length === 0 ? (
        <p className="font-mono text-[11px] text-muted-foreground/40">No memories yet.</p>
      ) : (
        <div className="space-y-3">
          {bars.map(({ type, count, pct }) => (
            <AppLink
              key={type}
              to="/$projectId"
              params={{ projectId }}
              search={(prev) => ({ ...prev, tab: "memories", type })}
              className="group w-full cursor-pointer space-y-1.5 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
                  {type}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-foreground/70">{count}</span>
                  <span className="font-mono text-[10px] text-muted-foreground/40 w-7 text-right">
                    {pct}%
                  </span>
                </div>
              </div>
              <div className="h-px rounded-full bg-border/60 overflow-hidden relative">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full opacity-60 group-hover:opacity-80 transition-opacity",
                    typeColorVariants({ type, tone: "bg" })
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </AppLink>
          ))}
        </div>
      )}
    </div>
  );
}

interface AttentionBlockProps {
  project: Project;
  synthesis: Synthesis | null;
  isStale: boolean;
  isStuck: boolean;
  isLoading: boolean;
}

export function AttentionBlock({
  project,
  synthesis,
  isStale,
  isStuck,
  isLoading,
}: AttentionBlockProps) {
  const { flaggedCount, pinnedGlobal, pinnedProject } = useAttentionData(project.id);

  const isInFlight = synthesis?.inFlightSince != null;
  const synthesizedAt = synthesis?.synthesizedAt ?? null;

  const synthLine = getSynthLine({
    synthesis,
    isLoading,
    isInFlight,
    isStuck,
    isStale,
    synthesizedAt,
  });
  const pinnedTotal = pinnedGlobal + pinnedProject;
  const allClear = flaggedCount === 0 && !isStale && !isStuck && !!synthesis && !isInFlight;

  return (
    <div className="space-y-3">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Attention</span>
      <div className="space-y-2.5 font-mono text-[11px]">
        {flaggedCount > 0 && (
          <AppLink
            to="/review"
            search={{ projectId: project.id }}
            className="group flex w-full items-center justify-between text-destructive hover:text-destructive/80 transition-colors cursor-pointer"
          >
            <span>{flaggedCount} flagged for review</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </AppLink>
        )}
        <div className={synthLine.className}>{synthLine.text}</div>
        {pinnedTotal > 0 && (
          <div className="text-muted-foreground/70">
            {pinnedTotal} pinned
            <span className="text-muted-foreground/40">
              {" "}
              (
              {[
                pinnedGlobal > 0 && `${pinnedGlobal} global`,
                pinnedProject > 0 && `${pinnedProject} here`,
              ]
                .filter(Boolean)
                .join(", ")}
              )
            </span>
          </div>
        )}
        {allClear && pinnedTotal === 0 && (
          <div className="text-muted-foreground/30">Nothing flagged.</div>
        )}
      </div>
    </div>
  );
}

function getSynthLine({
  synthesis,
  isLoading,
  isInFlight,
  isStuck,
  isStale,
  synthesizedAt,
}: {
  synthesis: Synthesis | null;
  isLoading: boolean;
  isInFlight: boolean;
  isStuck: boolean;
  isStale: boolean;
  synthesizedAt: string | null;
}): { text: string; className: string } {
  if (isLoading && !synthesis) return { text: "Loading…", className: "text-muted-foreground/40" };
  if (isStuck) return { text: "Synthesis stuck", className: "text-destructive" };
  if (isInFlight) return { text: "Synthesizing…", className: "text-muted-foreground/50" };
  if (isStale)
    return {
      text: synthesizedAt
        ? `Synthesis stale · ${formatRelativeTime(synthesizedAt)}`
        : "Synthesis stale",
      className: "text-stale",
    };
  if (!synthesis) return { text: "No synthesis yet", className: "text-muted-foreground/40" };
  return {
    text: synthesizedAt
      ? `Synthesis fresh · ${formatRelativeTime(synthesizedAt)}`
      : "Synthesis ready",
    className: "text-muted-foreground/70",
  };
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
