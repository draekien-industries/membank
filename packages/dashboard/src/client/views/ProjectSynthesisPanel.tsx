import { ArrowsClockwise, Lightning, WarningCircle } from "@phosphor-icons/react";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useProjectSynthesis } from "@/hooks/useProjectSynthesis";
import { memoriesCollection } from "@/lib/collections";
import type { Memory, MemoryType, Project, Synthesis } from "@/lib/types";
import { MEMORY_TYPES, SYNTHESIS_PENDING } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  AttentionBlock,
  CompositionBars,
  countMemoriesByType,
  OverviewHeader,
  RecentActivityList,
  TYPE_COLORS,
} from "@/views/ProjectOverviewDashboard";

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

function XmlClose({ tag }: { tag: string }) {
  return <span className="text-muted-foreground/40">&lt;/{tag}&gt;</span>;
}

function XmlOpen({ tag }: { tag: string }) {
  return <span className="text-muted-foreground/40">&lt;{tag}&gt;</span>;
}

function XmlAttr({ name, value, className }: { name: string; value: string; className?: string }) {
  return (
    <>
      <span className="text-muted-foreground/30"> {name}=&quot;</span>
      <span className={className}>{value}</span>
      <span className="text-muted-foreground/30">&quot;</span>
    </>
  );
}

function InFlightIndicator({
  isStuck,
  onReset,
}: {
  isStuck: boolean;
  onReset: () => Promise<void>;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Spinner className="size-3" />
        <span className="text-[11px]">Synthesizing&hellip;</span>
      </div>
      {isStuck && <StuckResetButton onReset={onReset} />}
    </div>
  );
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

interface SynthesisSectionProps {
  synthesis: Synthesis | null;
  isLoading: boolean;
  isStale: boolean;
  isStuck: boolean;
  error: string | null;
  onRun: () => Promise<void>;
  onReset: () => Promise<void>;
}

function SynthesisSection({
  synthesis,
  isLoading,
  isStale,
  isStuck,
  error,
  onRun,
  onReset,
}: SynthesisSectionProps) {
  const isInFlight = synthesis?.inFlightSince != null;
  const hasPriorContent = isInFlight && synthesis?.content !== SYNTHESIS_PENDING;
  const synthIsEmpty = !synthesis && !isLoading && !error;
  const isSettled = synthesis !== null && !isInFlight;

  return (
    <div className="p-3 space-y-1.5">
      {/* Opening tag line with state attributes and optional regenerate button */}
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground/40 text-[11px]">
          &lt;synthesis
          {synthesis?.synthesizedAt && !isInFlight && (
            <XmlAttr
              name="updated"
              value={formatRelativeTime(synthesis.synthesizedAt)}
              className="text-muted-foreground/60"
            />
          )}
          {isLoading && !synthesis && (
            <XmlAttr name="status" value="loading" className="text-muted-foreground/50" />
          )}
          {error && <XmlAttr name="status" value="error" className="text-destructive/70" />}
          {synthIsEmpty && (
            <XmlAttr name="status" value="empty" className="text-muted-foreground/50" />
          )}
          {isInFlight && (
            <XmlAttr name="status" value="generating" className="text-muted-foreground/50" />
          )}
          {isSettled && isStale && <XmlAttr name="status" value="stale" className="text-stale" />}
          &gt;
        </span>
        {(isSettled || isInFlight) && (
          <button
            type="button"
            onClick={() => void onRun()}
            aria-label="Regenerate synthesis"
            className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-0.5 rounded shrink-0"
          >
            <ArrowsClockwise className="size-3" />
          </button>
        )}
      </div>

      {/* Empty state */}
      {synthIsEmpty && (
        <div className="pl-3 space-y-2 py-0.5">
          <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
            Synthesis condenses your memories into a concise brief injected at the start of each
            session. Without it, only pinned memories are sent (see below).
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void onRun()}
            className="gap-1.5 h-6 text-[11px] px-2"
          >
            <Lightning weight="fill" className="size-3" />
            Generate
          </Button>
        </div>
      )}

      {/* Initial DB load skeleton */}
      {isLoading && !synthesis && (
        <div className="pl-3 space-y-1.5 py-0.5">
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-3/4" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="pl-3 space-y-1 py-0.5">
          <div className="flex items-start gap-1.5">
            <WarningCircle weight="fill" className="size-3 text-destructive mt-0.5 shrink-0" />
            <p className="text-[11px] text-destructive leading-relaxed">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void onRun()}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* In-flight, no prior content to show */}
      {isInFlight && !hasPriorContent && (
        <div className="pl-3 space-y-2 py-0.5">
          <InFlightIndicator isStuck={isStuck} onReset={onReset} />
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-5/6" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-3/4" />
          </div>
        </div>
      )}

      {synthesis !== null && (!isInFlight || hasPriorContent) && (
        <div className={cn("pl-3", isInFlight && "opacity-50")}>
          {isInFlight && (
            <div className="mb-2">
              <InFlightIndicator isStuck={isStuck} onReset={onReset} />
            </div>
          )}
          <ScrollArea className="h-40">
            <div className="text-foreground/70 whitespace-pre-wrap leading-relaxed">
              {synthesis.content}
            </div>
          </ScrollArea>
        </div>
      )}

      <XmlClose tag="synthesis" />
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
  hasContent: boolean;
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
  const hasContent = statParts.length > 0 || settledSynthesis !== null || hasPinned;

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
    hasContent,
    copied,
    guidanceOpen,
    handleCopy,
    setGuidanceOpen,
  };
}

interface SessionContextPanelProps {
  project: Project;
  synthesis: Synthesis | null;
  isLoading: boolean;
  isStale: boolean;
  isStuck: boolean;
  error: string | null;
  onRun: () => Promise<void>;
  onReset: () => Promise<void>;
  label?: string;
}

function SessionContextPanel({
  project,
  synthesis,
  isLoading,
  isStale,
  isStuck,
  error,
  onRun,
  onReset,
  label = "Session context",
}: SessionContextPanelProps) {
  const {
    pinnedGlobal,
    pinnedProject,
    statParts,
    settledSynthesis,
    hasPinned,
    hasContent,
    copied,
    guidanceOpen,
    handleCopy,
    setGuidanceOpen,
  } = useSessionContext(project, synthesis);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        {hasContent && (
          <button
            type="button"
            onClick={handleCopy}
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      <div className="rounded-md bg-muted/40 font-mono text-xs divide-y divide-border/30 overflow-hidden">
        {statParts.length > 0 && (
          <div className="p-3 space-y-0.5">
            <XmlOpen tag="memory-stats" />
            <div className="pl-3 text-foreground/70">{statParts.join(", ")}</div>
            <XmlClose tag="memory-stats" />
          </div>
        )}

        <SynthesisSection
          synthesis={synthesis}
          isLoading={isLoading}
          isStale={isStale}
          isStuck={isStuck}
          error={error}
          onRun={onRun}
          onReset={onReset}
        />

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
    </div>
  );
}

export function ProjectOverviewTab({ project }: { project: Project }) {
  const { synthesis, isLoading, isStale, isStuck, error, run, reset } =
    useProjectSynthesis(project);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
        <div className="max-w-[1100px] space-y-8">
          <OverviewHeader project={project} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8">
            <CompositionBars projectId={project.id} />
            <div className="space-y-8">
              <AttentionBlock
                project={project}
                synthesis={synthesis}
                isStale={isStale}
                isStuck={isStuck}
                isLoading={isLoading}
              />
              <RecentActivityList scope={project.scopeHash} />
            </div>
          </div>
          <SessionContextPanel
            project={project}
            synthesis={synthesis}
            isLoading={isLoading}
            isStale={isStale}
            isStuck={isStuck}
            error={error}
            onRun={run}
            onReset={reset}
            label="SESSION INJECTION PREVIEW"
          />
        </div>
      </div>
    </div>
  );
}
