import { Lightning, WarningCircle } from "@phosphor-icons/react";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useProjectSynthesis } from "@/hooks/useProjectSynthesis";
import { memoriesCollection } from "@/lib/collections";
import type { MemoryType, Project, Synthesis } from "@/lib/types";
import { MEMORY_TYPES, SYNTHESIS_PENDING } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

interface SynthesisMetadataProps {
  synthesis: Synthesis;
  isStale: boolean;
}

function SynthesisMetadata({ synthesis, isStale }: SynthesisMetadataProps) {
  return (
    <div className="flex items-center gap-2">
      {isStale ? <Badge variant="stale">Stale</Badge> : null}
      <span
        className="text-[10px] text-muted-foreground/70 tabular-nums"
        title={synthesis.synthesizedAt}
      >
        {formatRelativeTime(synthesis.synthesizedAt)}
      </span>
    </div>
  );
}

function StuckResetButton({ onReset }: { onReset: () => Promise<void> }) {
  return (
    <button
      type="button"
      onClick={() => void onReset()}
      className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors underline underline-offset-2"
    >
      Taking too long? Reset
    </button>
  );
}

interface SynthesisBlockProps {
  synthesis: Synthesis | null;
  isLoading: boolean;
  isStale: boolean;
  isStuck: boolean;
  error: string | null;
  onRun: () => Promise<void>;
  onReset: () => Promise<void>;
}

function SynthesisBlock({
  synthesis,
  isLoading,
  isStale,
  isStuck,
  error,
  onRun,
  onReset,
}: SynthesisBlockProps) {
  const isInFlight = synthesis?.inFlightSince !== null && synthesis?.inFlightSince !== undefined;
  const hasPriorContent = isInFlight && synthesis.content !== SYNTHESIS_PENDING;
  const isEmpty = !synthesis && !isLoading && !error;
  const isSettled = synthesis !== null && !isInFlight;

  if (isLoading && !synthesis) {
    return (
      <div className="rounded-md bg-muted/40 p-4 space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-muted/40 p-4 flex items-start gap-2">
        <WarningCircle weight="fill" className="size-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => void onRun()}
            className="text-[11px] text-muted-foreground hover:text-foreground mt-1 underline underline-offset-2 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="rounded-md bg-muted/40 p-4 space-y-3">
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">No synthesis yet.</p>
          <p className="text-[11px] text-muted-foreground/70">
            Run a synthesis to see a summary of what this project&apos;s memories contain.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void onRun()} className="gap-1.5">
          <Lightning weight="fill" className="size-3" />
          Generate
        </Button>
      </div>
    );
  }

  if (isInFlight && !hasPriorContent) {
    return (
      <div className="rounded-md bg-muted/40 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Spinner className="size-3" />
            <span className="text-[11px]">Synthesizing&hellip;</span>
          </div>
          {isStuck ? <StuckResetButton onReset={onReset} /> : null}
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    );
  }

  if (!synthesis) return null;

  return (
    <div className="rounded-md bg-muted/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          Memory synthesis
        </span>
        <SynthesisMetadata synthesis={synthesis} isStale={isStale} />
      </div>
      <div
        className={cn(
          "text-sm leading-relaxed max-w-[70ch] text-foreground/90 whitespace-pre-wrap",
          isInFlight && "opacity-50"
        )}
      >
        {isInFlight ? (
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner className="size-3" />
              <span className="text-[11px]">Synthesizing&hellip;</span>
            </div>
            {isStuck ? <StuckResetButton onReset={onReset} /> : null}
          </div>
        ) : null}
        {synthesis.content}
      </div>
      {isSettled ? (
        <div className="flex justify-end">
          {isStale ? (
            <Button size="sm" variant="secondary" onClick={() => void onRun()} className="gap-1.5">
              <Lightning weight="fill" className="size-3" />
              Regenerate
            </Button>
          ) : (
            <button
              type="button"
              onClick={() => void onRun()}
              className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              Regenerate
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface ProjectMemoryFooterProps {
  projectId: string;
}

function ProjectMemoryFooter({ projectId }: ProjectMemoryFooterProps) {
  const { data: allMemories = [] } = useLiveQuery((q) => q.from({ m: memoriesCollection }), []);

  const counts = useMemo(() => {
    const projectMemories = allMemories.filter((m) => m.projects.some((p) => p.id === projectId));
    const result = {} as Record<MemoryType, number>;
    for (const type of MEMORY_TYPES) result[type] = 0;
    for (const m of projectMemories) {
      const t = m.type as MemoryType;
      if (t in result) result[t]++;
    }
    return result;
  }, [allMemories, projectId]);

  const nonZero = MEMORY_TYPES.filter((t) => counts[t] > 0);
  if (nonZero.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {nonZero.map((type) => (
        <Badge key={type} variant={type}>
          {counts[type]} {type}
          {counts[type] !== 1 ? "s" : ""}
        </Badge>
      ))}
    </div>
  );
}

interface ProjectSynthesisPanelProps {
  project: Project;
}

export function ProjectSynthesisPanel({ project }: ProjectSynthesisPanelProps) {
  const { synthesis, isLoading, isStale, isStuck, error, run, reset } =
    useProjectSynthesis(project);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <header>
        <h2 className="font-heading text-base font-semibold text-foreground">{project.name}</h2>
        <p className="font-mono text-[10px] text-muted-foreground/50 mt-0.5 truncate">
          {project.scopeHash}
        </p>
      </header>
      <SynthesisBlock
        synthesis={synthesis}
        isLoading={isLoading}
        isStale={isStale}
        isStuck={isStuck}
        error={error}
        onRun={run}
        onReset={reset}
      />
      <ProjectMemoryFooter projectId={project.id} />
    </div>
  );
}
