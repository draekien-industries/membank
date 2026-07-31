import { Trash } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { deleteManyMemories, getLowRetention } from "@/lib/api";
import { queryClient } from "@/lib/collections";
import type { LowRetentionEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Route } from "../routes/retention";

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function RetentionMode() {
  const { projectId } = Route.useSearch();
  const [entries, setEntries] = useState<LowRetentionEntry[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setEntries(null);
    setSelected(new Set());
    getLowRetention(projectId)
      .then(setEntries)
      .catch(() => {
        toast.error("Could not load low-retention memories");
        setEntries([]);
      });
  }, [projectId]);

  useEffect(load, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteManyMemories([...selected]);
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
      toast.success(`Deleted ${selected.size} ${selected.size === 1 ? "memory" : "memories"}`);
      load();
    } catch {
      toast.error("Delete failed — try again");
    } finally {
      setDeleting(false);
    }
  };

  if (entries === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border">
        <h1 className="text-xs font-mono text-foreground">Low retention</h1>
        <span className="text-[10px] font-mono text-muted-foreground">
          {entries.length} below the floor — nothing is removed until you say so
        </span>
        <div className="flex-1" />
        <Button
          variant="destructive"
          size="sm"
          disabled={selected.size === 0 || deleting}
          onClick={handleDelete}
        >
          <Trash weight="regular" />
          Delete {selected.size > 0 ? selected.size : ""}
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs font-mono text-muted-foreground">
            Every memory is earning its place.
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <ul>
            {entries.map(({ memory, retention }) => (
              <li key={memory.id} className="border-b border-border">
                <button
                  type="button"
                  onClick={() => toggle(memory.id)}
                  className={cn(
                    "w-full text-left px-4 py-2.5 transition-colors",
                    selected.has(memory.id) ? "bg-muted/60" : "hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <input
                      type="checkbox"
                      checked={selected.has(memory.id)}
                      readOnly
                      tabIndex={-1}
                      className="size-3 accent-destructive"
                    />
                    <Badge variant={memory.type} className="text-[10px]">
                      {memory.type}
                    </Badge>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      score {retention.toFixed(2)} · {memory.accessCount} retrievals · idle{" "}
                      {daysSince(memory.updatedAt)}d
                    </span>
                  </div>
                  <p className="text-xs font-mono truncate">{memory.content}</p>
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}
