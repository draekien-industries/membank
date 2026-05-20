import { ArrowLeft, CheckCircle, Lightning, Trash, Warning } from "@phosphor-icons/react";
import { useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteManyMemories,
  getFlaggedClusters,
  mergeMemories,
  resolveManyMemories,
  suggestMerge,
} from "@/lib/api";
import { projectsCollection, queryClient } from "@/lib/collections";
import type { Memory, MemoryCluster } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Route } from "../routes/review";

function similarityLabel(sim: number): string {
  if (sim >= 0.9) return "high";
  if (sim >= 0.75) return "mid";
  return "low";
}

function ClusterListItem({
  cluster,
  selected,
  onClick,
}: {
  cluster: MemoryCluster;
  selected: boolean;
  onClick: () => void;
}) {
  const snippet = cluster.memories[0]?.content.slice(0, 60) ?? "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-2.5 border-b border-border transition-colors",
        selected
          ? "bg-muted/60 text-foreground"
          : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {cluster.isStale ? (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            stale
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            {Math.round(cluster.maxSimilarity * 100)}%
          </Badge>
        )}
        <span className="text-[10px] font-mono text-muted-foreground">
          {cluster.memories.length} {cluster.memories.length === 1 ? "memory" : "memories"}
        </span>
        {!cluster.isStale && (
          <span className="text-[10px] font-mono text-muted-foreground">
            · {similarityLabel(cluster.maxSimilarity)} similarity
          </span>
        )}
      </div>
      <p className="text-xs font-mono truncate">{snippet}…</p>
    </button>
  );
}

function MemoryCard({ memory }: { memory: Memory }) {
  return (
    <div className="flex flex-col h-full border border-border rounded-sm overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <Badge variant={memory.type} className="text-[10px]">
          {memory.type}
        </Badge>
        {memory.pinned && (
          <Badge variant="default" className="text-[10px]">
            pinned
          </Badge>
        )}
        <span className="ml-auto text-[10px] font-mono text-muted-foreground truncate">
          {memory.id.slice(0, 8)}
        </span>
      </div>
      <ScrollArea className="flex-1">
        <p className="px-3 py-2.5 text-xs font-mono whitespace-pre-wrap leading-relaxed">
          {memory.content}
        </p>
      </ScrollArea>
      {memory.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-2 border-t border-border shrink-0">
          {memory.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] font-mono text-muted-foreground bg-muted rounded px-1"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface ClusterDetailProps {
  cluster: MemoryCluster;
  onResolved: () => void;
}

function ClusterDetail({ cluster, onResolved }: ClusterDetailProps) {
  const [mergeContent, setMergeContent] = useState("");
  const [synthesizing, setSynthesizing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSynthesize = async () => {
    setSynthesizing(true);
    try {
      const { content } = await suggestMerge(cluster.memories.map((m) => m.id));
      setMergeContent(content);
    } catch {
      toast.error("Synthesis failed — check that synthesis is enabled in config");
    } finally {
      setSynthesizing(false);
    }
  };

  const handleMerge = async () => {
    if (!mergeContent.trim()) {
      toast.error("Enter merged content first");
      return;
    }
    const [keep, ...drops] = cluster.memories;
    if (keep === undefined) return;
    setSubmitting(true);
    try {
      await mergeMemories(
        keep.id,
        drops.map((m) => m.id),
        mergeContent
      );
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
      toast.success("Memories merged");
      onResolved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAll = async () => {
    setSubmitting(true);
    try {
      await deleteManyMemories(cluster.memories.map((m) => m.id));
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
      toast.success("Memories deleted");
      onResolved();
    } catch {
      toast.error("Delete failed — try again");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveAll = async () => {
    setSubmitting(true);
    try {
      await resolveManyMemories(cluster.memories.map((m) => m.id));
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
      toast.success("Marked as reviewed");
      onResolved();
    } catch {
      toast.error("Resolve failed — try again");
    } finally {
      setSubmitting(false);
    }
  };

  const [primary] = cluster.memories;

  if (cluster.isStale && primary !== undefined) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-5 pt-4 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Warning weight="fill" className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground">
              Stale flag — conflicting memory was deleted
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="max-w-[70ch]">
            <MemoryCard memory={primary} />
          </div>
        </div>
        <div className="flex items-center gap-2 px-5 py-3 border-t border-border shrink-0">
          <Button
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => void handleResolveAll()}
          >
            <CheckCircle weight="regular" className="size-3.5 mr-1.5" />
            Resolve
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={submitting}
            className="text-destructive hover:text-destructive"
            onClick={() => void handleDeleteAll()}
          >
            <Trash weight="regular" className="size-3.5 mr-1.5" />
            Delete
          </Button>
          {submitting && <Spinner className="size-3.5" />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="text-[10px]">
            {Math.round(cluster.maxSimilarity * 100)}% similarity
          </Badge>
          <span className="text-xs font-mono text-muted-foreground">
            {cluster.memories.length} memories · select merged content below, then save
          </span>
        </div>
      </div>

      <div
        className="grid gap-3 px-5 py-4 shrink-0"
        style={{ gridTemplateColumns: `repeat(${cluster.memories.length}, minmax(0, 1fr))` }}
      >
        {cluster.memories.map((m) => (
          <div key={m.id} className="h-48">
            <MemoryCard memory={m} />
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col px-5 pb-4 gap-3 min-h-0">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] uppercase tracking-wide font-mono text-muted-foreground">
            Merged content
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            disabled={synthesizing || submitting}
            onClick={() => void handleSynthesize()}
          >
            {synthesizing ? (
              <Spinner className="size-3 mr-1.5" />
            ) : (
              <Lightning weight="fill" className="size-3 mr-1.5" />
            )}
            Synthesise
          </Button>
        </div>
        <Textarea
          value={mergeContent}
          onChange={(e) => setMergeContent(e.target.value)}
          placeholder="Edit the merged content here, or click Synthesise to generate a suggestion…"
          className="flex-1 min-h-0 font-mono text-xs resize-none"
        />
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            disabled={!mergeContent.trim() || submitting}
            onClick={() => void handleMerge()}
          >
            {submitting ? <Spinner className="size-3 mr-1.5" /> : null}
            Save merged
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={submitting}
            className="text-destructive hover:text-destructive"
            onClick={() => void handleDeleteAll()}
          >
            <Trash weight="regular" className="size-3.5 mr-1.5" />
            Delete all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={submitting}
            onClick={() => void handleResolveAll()}
          >
            <CheckCircle weight="regular" className="size-3.5 mr-1.5" />
            Resolve
          </Button>
          <div className="flex-1" />
          {submitting && <Spinner className="size-3.5" />}
        </div>
      </div>
    </div>
  );
}

export function ReviewMode() {
  const { projectId } = Route.useSearch();
  const { data: allProjects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);
  const project = projectId !== undefined ? allProjects.find((p) => p.id === projectId) : undefined;

  const [clusters, setClusters] = useState<MemoryCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadClusters = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFlaggedClusters(projectId);
      setClusters(data);
      setSelectedId((prev) => {
        if (prev !== null && data.some((cl) => cl.clusterId === prev)) return prev;
        return data[0]?.clusterId ?? null;
      });
    } catch {
      toast.error("Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadClusters();
  }, [loadClusters]);

  const selectedCluster = clusters.find((cl) => cl.clusterId === selectedId) ?? null;

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft weight="regular" className="size-3" />
          Back
        </Link>
        <span className="text-xs font-mono text-muted-foreground">·</span>
        <span className="text-xs font-mono font-medium">Review</span>
        {project !== undefined && (
          <>
            <span className="text-xs font-mono text-muted-foreground">·</span>
            <span className="text-xs font-mono text-muted-foreground">{project.name}</span>
          </>
        )}
        {!loading && (
          <>
            <span className="text-xs font-mono text-muted-foreground">·</span>
            <span className="text-xs font-mono text-muted-foreground">
              {clusters.length} {clusters.length === 1 ? "cluster" : "clusters"}
            </span>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1 gap-2 text-xs font-mono text-muted-foreground">
          <Spinner className="size-3.5" />
          Loading…
        </div>
      ) : clusters.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2">
          <CheckCircle weight="fill" className="size-8 text-muted-foreground/40" />
          <p className="text-xs font-mono text-muted-foreground">Nothing to review</p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          <div className="w-64 shrink-0 border-r border-border flex flex-col">
            <p className="text-[10px] uppercase tracking-wide font-mono text-muted-foreground px-4 pt-3 pb-2">
              Clusters
            </p>
            <ScrollArea className="flex-1">
              {clusters.map((cl) => (
                <ClusterListItem
                  key={cl.clusterId}
                  cluster={cl}
                  selected={cl.clusterId === selectedId}
                  onClick={() => setSelectedId(cl.clusterId)}
                />
              ))}
            </ScrollArea>
          </div>

          <div className="flex-1 min-w-0">
            {selectedCluster !== null ? (
              <ClusterDetail
                key={selectedCluster.clusterId}
                cluster={selectedCluster}
                onResolved={loadClusters}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-xs font-mono text-muted-foreground">
                Select a cluster
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
