import { Lightning, WarningCircle } from "@phosphor-icons/react";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useProjectSynthesis } from "@/hooks/useProjectSynthesis";
import { memoriesCollection } from "@/lib/collections";
import type { Memory, MemoryType, Project, Synthesis } from "@/lib/types";
import { MEMORY_TYPES, SYNTHESIS_PENDING } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

function countMemoriesByType(allMemories: Memory[], projectId: string): Record<MemoryType, number> {
  const result = {} as Record<MemoryType, number>;
  for (const type of MEMORY_TYPES) result[type] = 0;
  for (const m of allMemories.filter((m) => m.projects.some((p) => p.id === projectId))) {
    result[m.type as MemoryType]++;
  }
  return result;
}

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
    <div className="rounded-md bg-muted/40 p-4 space-y-3 w-fit">
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
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner className="size-3" />
              <span className="text-xs">Synthesizing&hellip;</span>
            </div>
            {isStuck ? <StuckResetButton onReset={onReset} /> : null}
          </div>
        ) : null}
        {synthesis.content}
      </div>
      {isSettled ? (
        <div className="flex justify-end pt-1">
          {isStale ? (
            <Button size="sm" variant="secondary" onClick={() => void onRun()} className="gap-1.5">
              <Lightning weight="fill" className="size-3" />
              Regenerate
            </Button>
          ) : (
            <button
              type="button"
              onClick={() => void onRun()}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
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

  const counts = useMemo(
    () => countMemoriesByType(allMemories, projectId),
    [allMemories, projectId]
  );

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

const MEMORY_GUIDANCE =
  "Save (call save_memory) when: (1) user states a preference or makes a decision; (2) user corrects you; (3) you discover a working fix after a tool error; (4) you learn a non-obvious project fact. Type ∈ correction|preference|decision|learning|fact. When unsure, save.\nQuery (call query_memory) before: answering anything that touches prior decisions, and before exploration tasks (file reads, searches, web lookups) where past corrections or preferences may apply. Skip when clearly irrelevant (e.g. trivial arithmetic). Soft guideline, not a hard rule.";

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildCopyText(
  stats: Record<MemoryType, number>,
  pinnedGlobal: Memory[],
  pinnedProject: Memory[],
  synthesis: Synthesis | null
): string {
  const parts: string[] = [];

  const statParts = MEMORY_TYPES.filter((t) => stats[t] > 0).map(
    (t) => `${stats[t]} ${t}${stats[t] !== 1 ? "s" : ""}`
  );
  if (statParts.length > 0) {
    parts.push(`<memory-stats>\n${statParts.join(", ")}\n</memory-stats>`);
  }

  const isSettled =
    synthesis !== null &&
    synthesis.inFlightSince === null &&
    synthesis.content !== SYNTHESIS_PENDING;

  if (isSettled) {
    parts.push(`<synthesis>\n${synthesis.content}\n</synthesis>`);
  } else {
    const allPinned = [...pinnedGlobal, ...pinnedProject];
    if (allPinned.length > 0) {
      const lines = allPinned.map(
        (m) => `  <memory type="${m.type}">${xmlEscape(m.content)}</memory>`
      );
      parts.push(`<pinned-memories>\n${lines.join("\n")}\n</pinned-memories>`);
    }
  }

  parts.push(`<memory-guidance>\n${MEMORY_GUIDANCE}\n</memory-guidance>`);
  return parts.join("\n");
}

const TYPE_COLORS: Record<MemoryType, string> = {
  correction: "oklch(0.72 0.16 25)",
  preference: "oklch(0.68 0.14 250)",
  decision: "oklch(0.65 0.14 300)",
  learning: "oklch(0.65 0.14 165)",
  fact: "oklch(0.62 0.006 165)",
};

function XmlOpen({ tag }: { tag: string }) {
  return <span className="text-muted-foreground/40">&lt;{tag}&gt;</span>;
}

function XmlClose({ tag }: { tag: string }) {
  return <span className="text-muted-foreground/40">&lt;/{tag}&gt;</span>;
}

function MemoryLine({ memory }: { memory: Memory }) {
  const color = TYPE_COLORS[memory.type];
  const content = memory.content.length > 140 ? `${memory.content.slice(0, 140)}…` : memory.content;
  return (
    <div className="pl-3 leading-relaxed">
      <span className="text-muted-foreground/40">&lt;memory type=&quot;</span>
      <span style={{ color }}>{memory.type}</span>
      <span className="text-muted-foreground/40">&quot;&gt;</span>
      <span className="text-foreground/70">{xmlEscape(content)}</span>
      <span className="text-muted-foreground/40">&lt;/memory&gt;</span>
    </div>
  );
}

function ScopeLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="pl-3 text-[10px] text-muted-foreground/30 select-none">
      {`── ${label} (${count}) ──`}
    </div>
  );
}

interface SessionContextState {
  pinnedGlobal: Memory[];
  pinnedProject: Memory[];
  stats: Record<MemoryType, number>;
  statParts: string[];
  settledSynthesis: Synthesis | null;
  hasPinned: boolean;
  isEmpty: boolean;
  copied: boolean;
  guidanceOpen: boolean;
  handleCopy: () => void;
  setGuidanceOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
}

function useSessionContext(project: Project, synthesis: Synthesis | null): SessionContextState {
  const [copied, setCopied] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);

  const { data: allMemories = [] } = useLiveQuery((q) => q.from({ m: memoriesCollection }), []);

  const pinnedGlobal = useMemo(
    () => allMemories.filter((m) => m.pinned && m.projects.length === 0),
    [allMemories]
  );

  const pinnedProject = useMemo(
    () => allMemories.filter((m) => m.pinned && m.projects.some((p) => p.id === project.id)),
    [allMemories, project.id]
  );

  const stats = useMemo(
    () => countMemoriesByType(allMemories, project.id),
    [allMemories, project.id]
  );

  const settledSynthesis =
    synthesis !== null &&
    synthesis.inFlightSince === null &&
    synthesis.content !== SYNTHESIS_PENDING
      ? synthesis
      : null;

  const statParts = useMemo(
    () =>
      MEMORY_TYPES.filter((t) => stats[t] > 0).map(
        (t) => `${stats[t]} ${t}${stats[t] !== 1 ? "s" : ""}`
      ),
    [stats]
  );

  const hasPinned = pinnedGlobal.length > 0 || pinnedProject.length > 0;
  const isEmpty = statParts.length === 0 && settledSynthesis === null && !hasPinned;

  const copyText = useMemo(
    () => buildCopyText(stats, pinnedGlobal, pinnedProject, synthesis),
    [stats, pinnedGlobal, pinnedProject, synthesis]
  );

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [copyText]);

  return {
    pinnedGlobal,
    pinnedProject,
    stats,
    statParts,
    settledSynthesis,
    hasPinned,
    isEmpty,
    copied,
    guidanceOpen,
    handleCopy,
    setGuidanceOpen,
  };
}

interface SessionContextPanelProps {
  project: Project;
  synthesis: Synthesis | null;
  label?: string;
}

function SessionContextPanel({
  project,
  synthesis,
  label = "Session context",
}: SessionContextPanelProps) {
  const {
    pinnedGlobal,
    pinnedProject,
    statParts,
    settledSynthesis,
    hasPinned,
    isEmpty,
    copied,
    guidanceOpen,
    handleCopy,
    setGuidanceOpen,
  } = useSessionContext(project, synthesis);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        {!isEmpty && (
          <button
            type="button"
            onClick={handleCopy}
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      {isEmpty ? (
        <p className="text-xs text-muted-foreground">
          No context will be injected yet — add memories or generate synthesis to see what your
          session will receive.
        </p>
      ) : (
        <div className="rounded-md bg-muted/40 font-mono text-xs divide-y divide-border/30 overflow-hidden">
          {statParts.length > 0 && (
            <div className="p-3 space-y-0.5">
              <XmlOpen tag="memory-stats" />
              <div className="pl-3 text-foreground/70">{statParts.join(", ")}</div>
              <XmlClose tag="memory-stats" />
            </div>
          )}

          {settledSynthesis !== null && (
            <div className="p-3 space-y-0.5">
              <XmlOpen tag="synthesis" />
              <ScrollArea className="h-40">
                <div className="pl-3 text-foreground/70 whitespace-pre-wrap leading-relaxed">
                  {settledSynthesis.content}
                </div>
              </ScrollArea>
              <XmlClose tag="synthesis" />
            </div>
          )}

          {settledSynthesis === null && hasPinned && (
            <div className="p-3 space-y-0.5">
              <XmlOpen tag="pinned-memories" />
              {pinnedGlobal.length > 0 && (
                <div className="space-y-0.5">
                  <ScopeLabel label="global" count={pinnedGlobal.length} />
                  {pinnedGlobal.map((m) => (
                    <MemoryLine key={m.id} memory={m} />
                  ))}
                </div>
              )}
              {pinnedProject.length > 0 && (
                <div className="space-y-0.5">
                  <ScopeLabel label="project" count={pinnedProject.length} />
                  {pinnedProject.map((m) => (
                    <MemoryLine key={m.id} memory={m} />
                  ))}
                </div>
              )}
              <XmlClose tag="pinned-memories" />
            </div>
          )}

          <div className="p-3 space-y-0.5">
            <button
              type="button"
              onClick={() => setGuidanceOpen((o) => !o)}
              className="flex items-center gap-1 text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors w-full text-left"
            >
              <XmlOpen tag="memory-guidance" />
              <span className="text-[10px] ml-1">{guidanceOpen ? "▲" : "▼"}</span>
            </button>
            {guidanceOpen && (
              <>
                <div className="pl-3 text-foreground/60 whitespace-pre-wrap leading-relaxed">
                  {MEMORY_GUIDANCE}
                </div>
                <XmlClose tag="memory-guidance" />
              </>
            )}
          </div>
        </div>
      )}
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
      <SessionContextPanel project={project} synthesis={synthesis} />
    </div>
  );
}

function OverviewTypeStrip({ projectId }: { projectId: string }) {
  const { data: allMemories = [] } = useLiveQuery((q) => q.from({ m: memoriesCollection }), []);

  const nonZero = useMemo(() => {
    const counts = countMemoriesByType(allMemories, projectId);
    return MEMORY_TYPES.filter((t) => counts[t] > 0).map((t) => ({ type: t, count: counts[t] }));
  }, [allMemories, projectId]);

  if (nonZero.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-6 py-2.5 border-b border-border shrink-0">
      {nonZero.map(({ type, count }) => (
        <Badge key={type} variant={type}>
          {count} {type}
          {count !== 1 ? "s" : ""}
        </Badge>
      ))}
    </div>
  );
}

export function ProjectOverviewTab({ project }: { project: Project }) {
  const { synthesis, isLoading, isStale, isStuck, error, run, reset } =
    useProjectSynthesis(project);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <OverviewTypeStrip projectId={project.id} />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-6 space-y-6">
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
        </div>
        <aside className="w-[65ch] shrink-0 border-l border-border overflow-y-auto px-6 py-6">
          <SessionContextPanel
            project={project}
            synthesis={synthesis}
            label="SESSION INJECTION PREVIEW"
          />
        </aside>
      </div>
    </div>
  );
}
