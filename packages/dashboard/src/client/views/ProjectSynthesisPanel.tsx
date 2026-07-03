import { diffLines, GLOBAL_PROJECT_NAME } from "@membank/core/client";
import { ArrowsClockwise, Lightning, WarningCircle } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProjectRow } from "@/hooks/useProjectRows";
import { useProjectSynthesis } from "@/hooks/useProjectSynthesis";
import { useSynthesisHistory } from "@/hooks/useSynthesisHistory";
import { getSessionContext } from "@/lib/api";
import { typeColorVariants } from "@/lib/typeColors";
import type {
  Memory,
  MemoryType,
  Project,
  SessionContext,
  SessionContextSection,
  Synthesis,
  SynthesisVersion,
} from "@/lib/types";
import { SYNTHESIS_PENDING } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  ActivityTrend,
  CompositionBars,
  OverviewHeader,
  OverviewKpiStrip,
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

function XmlClose({ tag }: { tag: string }) {
  return <span className="text-muted-foreground/40">&lt;/{tag}&gt;</span>;
}

function XmlOpen({ tag }: { tag: string }) {
  return <span className="text-muted-foreground/40">&lt;{tag}&gt;</span>;
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

function SynthesisHistorySection({
  projectId,
  memoryType,
}: {
  projectId: string;
  memoryType: MemoryType;
}) {
  const { versions: allVersions, isLoading, reverting, revert } = useSynthesisHistory(projectId);
  const versions = useMemo(
    () => allVersions.filter((v) => v.memoryType === memoryType),
    [allVersions, memoryType]
  );
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
    const ok = await revert(revertTarget.version, memoryType);
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

function MemoryLine({ type, content }: { type?: MemoryType; content: string }) {
  const text = content.length > 140 ? `${content.slice(0, 140)}…` : content;
  return (
    <div className="pl-3 leading-relaxed">
      <span className="text-muted-foreground/40">&lt;memory</span>
      {type !== undefined && (
        <>
          <span className="text-muted-foreground/30"> type=&quot;</span>
          <span className={typeColorVariants({ type })}>{type}</span>
          <span className="text-muted-foreground/30">&quot;</span>
        </>
      )}
      <span className="text-muted-foreground/40">&gt;</span>
      <span className="text-foreground/70">{xmlEscape(text)}</span>
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

const synthesisTriggerButton = cva(
  "group inline-flex h-5 shrink-0 items-center gap-1 rounded-sm text-[11px] transition-colors disabled:cursor-default",
  {
    variants: {
      state: {
        fresh: "px-1 text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground",
        stale: "px-1.5 font-medium text-stale bg-stale/10 hover:bg-stale/20",
        inflight: "px-1 text-muted-foreground",
      },
    },
    defaultVariants: { state: "fresh" },
  }
);

function SynthesisTriggerButton({
  memoryType,
  hasSynthesis,
  isStale,
  isInFlight,
  onRun,
}: {
  memoryType: MemoryType;
  hasSynthesis: boolean;
  isStale: boolean;
  isInFlight: boolean;
  onRun: (memoryType?: MemoryType) => Promise<void>;
}) {
  const state = isInFlight ? "inflight" : isStale ? "stale" : "fresh";
  const label = isInFlight
    ? `Synthesizing ${memoryType}…`
    : hasSynthesis
      ? `Regenerate ${memoryType} synthesis`
      : `Synthesize ${memoryType}`;

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        disabled={isInFlight}
        onClick={() => void onRun(memoryType)}
        aria-label={label}
        className={synthesisTriggerButton({ state })}
      >
        {isInFlight ? (
          <Spinner className="size-3" />
        ) : hasSynthesis ? (
          <ArrowsClockwise className="size-3 motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:rotate-180" />
        ) : (
          <Lightning weight="fill" className="size-3" />
        )}
        {state === "stale" ? (
          <span>Regenerate</span>
        ) : (
          !hasSynthesis && !isInFlight && <span>Synthesize</span>
        )}
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-mono text-[11px]">{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function SynthesisSectionView({
  section,
  synthesis,
  onRun,
  projectId,
}: {
  section: Extract<SessionContextSection, { kind: "synthesis" }>;
  synthesis: Synthesis | undefined;
  onRun: (memoryType?: MemoryType) => Promise<void>;
  projectId: string;
}) {
  const isInFlight = synthesis?.inFlightSince != null;
  const isStale =
    synthesis !== undefined &&
    synthesis.inFlightSince === null &&
    new Date(synthesis.expiresAt) < new Date();

  return (
    <div className="p-3 space-y-0.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <XmlOpen tag="synthesis" />
          <Badge variant={section.memoryType}>{section.memoryType}</Badge>
          {isStale && <span className="text-[10px] text-stale">stale</span>}
        </div>
        <SynthesisTriggerButton
          memoryType={section.memoryType}
          hasSynthesis
          isStale={isStale}
          isInFlight={isInFlight}
          onRun={onRun}
        />
      </div>
      <div className="max-h-40 overflow-y-auto pl-3 text-foreground/70 whitespace-pre-wrap leading-relaxed">
        {section.content}
      </div>
      <XmlClose tag="synthesis" />
      <SynthesisHistorySection projectId={projectId} memoryType={section.memoryType} />
    </div>
  );
}

function VerbatimSectionView({
  section,
  isInFlight,
  onRun,
}: {
  section: Extract<SessionContextSection, { kind: "verbatim" }>;
  isInFlight: boolean;
  onRun: (memoryType?: MemoryType) => Promise<void>;
}) {
  return (
    <div className="p-3 space-y-0.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <XmlOpen tag="memories" />
          <Badge variant={section.memoryType}>{section.memoryType}</Badge>
        </div>
        {section.synthesizable && (
          <SynthesisTriggerButton
            memoryType={section.memoryType}
            hasSynthesis={false}
            isStale={false}
            isInFlight={isInFlight}
            onRun={onRun}
          />
        )}
      </div>
      {section.memories.map((content) => (
        <MemoryLine key={content} content={content} />
      ))}
      <XmlClose tag="memories" />
    </div>
  );
}

function InFlightSynthesisView({
  synthesis,
  isStuck,
  onReset,
  projectId,
}: {
  synthesis: Synthesis;
  isStuck: boolean;
  onReset: () => Promise<void>;
  projectId: string;
}) {
  const hasPriorContent = synthesis.content !== SYNTHESIS_PENDING;

  return (
    <div className="p-3 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <XmlOpen tag="synthesis" />
        <Badge variant={synthesis.memoryType}>{synthesis.memoryType}</Badge>
      </div>
      <div className="pl-3 space-y-2 opacity-50">
        <InFlightIndicator isStuck={isStuck} onReset={onReset} />
        {hasPriorContent ? (
          <div className="max-h-40 overflow-y-auto text-foreground/70 whitespace-pre-wrap leading-relaxed">
            {synthesis.content}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-5/6" />
            <Skeleton className="h-2.5 w-3/4" />
          </div>
        )}
      </div>
      <XmlClose tag="synthesis" />
      <SynthesisHistorySection projectId={projectId} memoryType={synthesis.memoryType} />
    </div>
  );
}

function SynthesisEmptyState({ onRun }: { onRun: () => Promise<void> }) {
  return (
    <div className="p-3 space-y-2">
      <span className="text-muted-foreground/40 text-[11px]">
        &lt;synthesis status=&quot;empty&quot;&gt;
      </span>
      <p className="text-[11px] text-muted-foreground/50 leading-relaxed pl-3">
        Synthesis condenses your memories into a concise brief — one per memory type — injected at
        the start of each session, alongside the pinned memories shown above.
      </p>
      <div className="pl-3">
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
    </div>
  );
}

function SynthesisErrorState({ error, onRun }: { error: string; onRun: () => Promise<void> }) {
  return (
    <div className="p-3 space-y-1">
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
  );
}

function useSessionContext(
  projectId: string,
  refetchKey: string
): { context: SessionContext | null; copied: boolean; handleCopy: () => void } {
  const [context, setContext] = useState<SessionContext | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // refetchKey is read so the effect re-runs whenever synthesis state changes.
    void refetchKey;
    getSessionContext(projectId)
      .then((ctx) => {
        if (!cancelled) setContext(ctx);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load session context");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refetchKey]);

  const handleCopy = useCallback(() => {
    if (context === null) return;
    const text = `${context.rendered}\n<memory-guidance>\n${MEMORY_GUIDANCE}\n</memory-guidance>`;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [context]);

  return { context, copied, handleCopy };
}

interface SessionContextPanelProps {
  project: Project;
  syntheses: Synthesis[];
  isLoading: boolean;
  isStuck: boolean;
  error: string | null;
  onRun: (memoryType?: MemoryType) => Promise<void>;
  onReset: () => Promise<void>;
  label?: string;
}

function SynthesizeAllButton({
  anyInFlight,
  hasSynthesis,
  onRun,
}: {
  anyInFlight: boolean;
  hasSynthesis: boolean;
  onRun: () => Promise<void>;
}) {
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={anyInFlight}
      onClick={() => void onRun()}
      className="gap-1.5 h-6 px-2 text-[11px]"
    >
      {anyInFlight ? (
        <Spinner className="size-3" />
      ) : (
        <Lightning weight="fill" className="size-3" />
      )}
      {anyInFlight ? "Synthesizing…" : hasSynthesis ? "Regenerate all" : "Synthesize all"}
    </Button>
  );
}

function SessionContextPanel({
  project,
  syntheses,
  isLoading,
  isStuck,
  error,
  onRun,
  onReset,
  label = "Session context",
}: SessionContextPanelProps) {
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const refetchKey = useMemo(
    () => syntheses.map((s) => `${s.id}:${s.synthesizedAt}:${s.inFlightSince}`).join("|"),
    [syntheses]
  );
  const { context, copied, handleCopy } = useSessionContext(project.id, refetchKey);

  const pinnedGlobal: Memory[] = context?.pinnedGlobal ?? [];
  const pinnedProject: Memory[] = context?.pinnedProject ?? [];
  const stats = context?.stats;
  const statParts = stats
    ? (Object.entries(stats) as [MemoryType, number][])
        .filter(([, count]) => count > 0)
        .map(([type, count]) => `${count} ${type}${count !== 1 ? "s" : ""}`)
    : [];
  const hasPinned = pinnedGlobal.length > 0 || pinnedProject.length > 0;
  const hasContent = context !== null && context.rendered.length > 0;

  const synthesisByType = useMemo(() => {
    const map = new Map<MemoryType, Synthesis>();
    for (const s of syntheses) map.set(s.memoryType, s);
    return map;
  }, [syntheses]);

  const renderedTypes = new Set((context?.sections ?? []).map((s) => s.memoryType));
  const inFlightSyntheses = syntheses.filter(
    (s) => s.inFlightSince !== null && !renderedTypes.has(s.memoryType)
  );

  const isInitialLoad = context === null && isLoading;
  const isEmpty =
    context !== null &&
    context.sections.length === 0 &&
    inFlightSyntheses.length === 0 &&
    error === null;

  const anyInFlight = syntheses.some((s) => s.inFlightSince !== null);
  const showSynthesizeAll = !isInitialLoad && !isEmpty;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <div className="flex items-center gap-3">
          {showSynthesizeAll && (
            <SynthesizeAllButton
              anyInFlight={anyInFlight}
              hasSynthesis={syntheses.length > 0}
              onRun={onRun}
            />
          )}
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
      </div>

      <div className="rounded-md bg-muted/40 font-mono text-xs divide-y divide-border/30 overflow-hidden">
        {statParts.length > 0 && (
          <div className="p-3 space-y-0.5">
            <XmlOpen tag="memory-stats" />
            <div className="pl-3 text-foreground/70">{statParts.join(", ")}</div>
            <XmlClose tag="memory-stats" />
          </div>
        )}

        {hasPinned && (
          <div className="p-3 space-y-0.5">
            <XmlOpen tag="pinned-memories" />
            {pinnedGlobal.length > 0 && (
              <div className="space-y-0.5">
                <ScopeLabel label={GLOBAL_PROJECT_NAME} count={pinnedGlobal.length} />
                {pinnedGlobal.map((m) => (
                  <MemoryLine key={m.id} type={m.type} content={m.content} />
                ))}
              </div>
            )}
            {pinnedProject.length > 0 && (
              <div className="space-y-0.5">
                <ScopeLabel label="project" count={pinnedProject.length} />
                {pinnedProject.map((m) => (
                  <MemoryLine key={m.id} type={m.type} content={m.content} />
                ))}
              </div>
            )}
            <XmlClose tag="pinned-memories" />
          </div>
        )}

        {context?.sections.map((section) =>
          section.kind === "synthesis" ? (
            <SynthesisSectionView
              key={`synthesis:${section.memoryType}:${section.content}`}
              section={section}
              synthesis={synthesisByType.get(section.memoryType)}
              onRun={onRun}
              projectId={project.id}
            />
          ) : (
            <VerbatimSectionView
              key={`verbatim:${section.memoryType}:${section.memories.join(" ")}`}
              section={section}
              isInFlight={synthesisByType.get(section.memoryType)?.inFlightSince != null}
              onRun={onRun}
            />
          )
        )}

        {inFlightSyntheses.map((synthesis) => (
          <InFlightSynthesisView
            key={`inflight:${synthesis.memoryType}`}
            synthesis={synthesis}
            isStuck={isStuck}
            onReset={onReset}
            projectId={project.id}
          />
        ))}

        {isInitialLoad && (
          <div className="p-3 space-y-1.5">
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-3/4" />
          </div>
        )}

        {error !== null && <SynthesisErrorState error={error} onRun={onRun} />}

        {isEmpty && <SynthesisEmptyState onRun={onRun} />}

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
  const { syntheses, representative, isLoading, isStale, isStuck, error, run, reset } =
    useProjectSynthesis(project);
  const row = useProjectRow(project, 30);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
        <div className="max-w-[1100px] space-y-8">
          <OverviewHeader project={project} />
          <OverviewKpiStrip
            project={project}
            row={row}
            synthesis={representative}
            isStale={isStale}
            isStuck={isStuck}
            isLoading={isLoading}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8">
            <div className="space-y-8">
              <CompositionBars projectId={project.id} counts={row.byType} />
              <ActivityTrend projectId={project.id} />
            </div>
            <RecentActivityList scope={project.scopeHash} projectId={project.id} />
          </div>
          <SessionContextPanel
            project={project}
            syntheses={syntheses}
            isLoading={isLoading}
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
