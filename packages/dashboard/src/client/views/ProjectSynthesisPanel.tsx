import { diffLines, GLOBAL_PROJECT_NAME } from "@membank/core/client";
import { ArrowsClockwise, Lightning, WarningCircle } from "@phosphor-icons/react";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useProjectSynthesis } from "@/hooks/useProjectSynthesis";
import { useSynthesisHistory } from "@/hooks/useSynthesisHistory";
import { memoriesCollection } from "@/lib/collections";
import { typeColorVariants } from "@/lib/typeColors";
import type { Memory, MemoryType, Project, Synthesis, SynthesisVersion } from "@/lib/types";
import { MEMORY_TYPES, SYNTHESIS_PENDING } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  AttentionBlock,
  CompositionBars,
  countMemoriesByType,
  OverviewHeader,
  RecentActivityList,
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

type SynthesisRevertDialogProps = {
  version: SynthesisVersion;
  reverting: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

function SynthesisRevertDialogContent({
  version,
  reverting,
  onConfirm,
  onClose,
}: SynthesisRevertDialogProps) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Revert synthesis to version {version.version}?</DialogTitle>
      </DialogHeader>
      <p className="text-xs text-muted-foreground">
        The active synthesis will be archived as a new version before restoring this snapshot.
      </p>
      <pre className="text-[11px] font-mono whitespace-pre-wrap rounded border border-border bg-muted px-2 py-1.5 max-h-40 overflow-y-auto">
        {version.content}
      </pre>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="default" size="sm" disabled={reverting} onClick={onConfirm}>
          {reverting ? "Reverting…" : "Revert"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

type SynthesisDiffDialogProps = {
  a: SynthesisVersion;
  b: SynthesisVersion;
  onClose: () => void;
};

function SynthesisDiffDialogContent({ a, b, onClose }: SynthesisDiffDialogProps) {
  const entries = diffLines(a.content, b.content).map((entry, pos) => ({ ...entry, pos }));
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          Compare v{a.version} → v{b.version}
        </DialogTitle>
      </DialogHeader>
      <ScrollArea className="max-h-[60vh]">
        <pre className="text-[11px] font-mono leading-relaxed">
          {entries.map((entry) => (
            <div
              key={entry.pos}
              className={cn(
                "px-2",
                entry.kind === "added" &&
                  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                entry.kind === "removed" && "bg-rose-500/10 text-rose-700 dark:text-rose-400",
                entry.kind === "context" && "text-muted-foreground"
              )}
            >
              {entry.kind === "added" ? "+ " : entry.kind === "removed" ? "- " : "  "}
              {entry.line}
            </div>
          ))}
        </pre>
      </ScrollArea>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SynthesisHistorySection({ projectId }: { projectId: string }) {
  const { versions, isLoading, reverting, revert } = useSynthesisHistory(projectId);
  const [revertTarget, setRevertTarget] = useState<SynthesisVersion | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersions, setCompareVersions] = useState<SynthesisVersion[]>([]);

  if (!isLoading && versions.length === 0) return null;

  const diffA = compareVersions[0];
  const diffB = compareVersions[1];
  const hasDiffPair = diffA !== undefined && diffB !== undefined;

  const handleRowClick = (v: SynthesisVersion) => {
    if (compareMode) {
      setCompareVersions((prev) => {
        if (prev.some((x) => x.version === v.version)) {
          return prev.filter((x) => x.version !== v.version);
        }
        const next = [...prev, v];
        return next.length > 2 ? next.slice(-2) : next;
      });
    } else {
      setRevertTarget(v);
    }
  };

  const exitCompare = () => {
    setCompareMode(false);
    setCompareVersions([]);
  };

  const handleRevertConfirm = async () => {
    if (!revertTarget) return;
    const ok = await revert(revertTarget.version);
    if (ok) setRevertTarget(null);
  };

  return (
    <>
      <Dialog open={revertTarget !== null} onOpenChange={(open) => !open && setRevertTarget(null)}>
        <Collapsible className="group pt-1.5 border-t border-border/50">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger className="flex items-center gap-1 cursor-pointer text-[11px] uppercase tracking-wide text-muted-foreground/60 hover:text-muted-foreground transition-colors select-none">
              <span className="transition-transform group-data-[open]:rotate-90">›</span>
              History{versions.length > 0 ? ` (${versions.length})` : ""}
            </CollapsibleTrigger>
            {versions.length >= 2 && (
              <button
                type="button"
                onClick={() => {
                  if (compareMode) {
                    exitCompare();
                  } else {
                    setCompareMode(true);
                  }
                }}
                className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                {compareMode ? "Cancel" : "Compare"}
              </button>
            )}
          </div>
          <CollapsibleContent className="space-y-1 mt-1.5">
            {isLoading ? (
              <p className="text-[11px] text-muted-foreground">Loading…</p>
            ) : (
              <>
                {versions.map((v) => (
                  <button
                    key={v.version}
                    type="button"
                    className={cn(
                      "w-full text-left rounded border border-border px-2 py-1.5 space-y-0.5 hover:bg-muted transition-colors",
                      compareMode &&
                        compareVersions.some((x) => x.version === v.version) &&
                        "border-primary/50 bg-primary/5"
                    )}
                    onClick={() => handleRowClick(v)}
                  >
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">v{v.version}</span>
                      <span>{formatRelativeTime(v.synthesizedAt)}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {v.content.slice(0, 80)}
                    </p>
                  </button>
                ))}
                {compareMode && compareVersions.length === 1 && (
                  <p className="text-[11px] text-muted-foreground/60 py-0.5">
                    Select one more version to compare
                  </p>
                )}
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
        {revertTarget !== null && (
          <SynthesisRevertDialogContent
            version={revertTarget}
            reverting={reverting}
            onConfirm={() => void handleRevertConfirm()}
            onClose={() => setRevertTarget(null)}
          />
        )}
      </Dialog>
      {hasDiffPair && (
        <Dialog open={true} onOpenChange={(open) => !open && exitCompare()}>
          <SynthesisDiffDialogContent a={diffA} b={diffB} onClose={exitCompare} />
        </Dialog>
      )}
    </>
  );
}

function MemoryLine({ memory }: { memory: Memory }) {
  const content = memory.content.length > 140 ? `${memory.content.slice(0, 140)}…` : memory.content;
  return (
    <div className="pl-3 leading-relaxed">
      <span className="text-muted-foreground/40">&lt;memory type=&quot;</span>
      <span className={typeColorVariants({ type: memory.type })}>{memory.type}</span>
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
  projectId: string;
}

function SynthesisSection({
  synthesis,
  isLoading,
  isStale,
  isStuck,
  error,
  onRun,
  onReset,
  projectId,
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

      <SynthesisHistorySection projectId={projectId} />

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
          projectId={project.id}
        />

        {settledSynthesis === null && hasPinned && (
          <div className="p-3 space-y-0.5">
            <XmlOpen tag="pinned-memories" />
            {pinnedGlobal.length > 0 && (
              <div className="space-y-0.5">
                <ScopeLabel label={GLOBAL_PROJECT_NAME} count={pinnedGlobal.length} />
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
              <RecentActivityList scope={project.scopeHash} projectId={project.id} />
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
