import { ArrowLeft } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MemoryRow } from "@/components/MemoryRow";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { deleteMemory, listCapabilityMemories, patchMemory } from "@/lib/api";
import type { Memory } from "@/lib/types";
import { capitalize } from "@/lib/utils";

function useCapabilityMemories(capabilityKey: string) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    listCapabilityMemories(capabilityKey)
      .then((data) => {
        if (!cancelled) setMemories(data);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [capabilityKey]);

  useEffect(() => reload(), [reload]);

  return { memories, isLoading, reload };
}

interface CapabilityDetailProps {
  capabilityKey: string;
}

export function CapabilityDetail({ capabilityKey }: CapabilityDetailProps) {
  const decoded = decodeURIComponent(capabilityKey);
  const separatorIdx = decoded.indexOf(":");
  const kind = separatorIdx !== -1 ? decoded.slice(0, separatorIdx) : decoded;
  const name = separatorIdx !== -1 ? decoded.slice(separatorIdx + 1) : decoded;

  const { memories, isLoading, reload } = useCapabilityMemories(decoded);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handlePin = async (memory: Memory) => {
    try {
      await patchMemory(memory.id, { pinned: !memory.pinned });
      reload();
    } catch {
      toast.error("Failed to update pin — try again");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMemory(id);
      if (selectedId === id) setSelectedId(null);
      reload();
    } catch {
      toast.error("Failed to delete — try again");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="space-y-4">
        <Link
          to="/capabilities"
          className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft weight="regular" className="size-3" />
          Capabilities
        </Link>

        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[11px]">
              {capitalize(kind)}
            </Badge>
            <h1 className="text-sm font-mono font-medium text-foreground">{name}</h1>
          </div>
          {!isLoading && (
            <span className="text-[11px] font-mono text-muted-foreground">
              {memories.length} {memories.length === 1 ? "memory" : "memories"}
            </span>
          )}
        </header>

        {isLoading && (
          <div className="flex items-center justify-center h-24 text-xs font-mono text-muted-foreground">
            Loading…
          </div>
        )}

        {!isLoading && memories.length === 0 && (
          <Empty>
            <EmptyTitle>No memories for this capability</EmptyTitle>
            <EmptyDescription>
              Memories will appear here once your AI saves them with the{" "}
              <span className="font-mono">{decoded}</span> scope.
            </EmptyDescription>
          </Empty>
        )}

        {!isLoading && memories.length > 0 && (
          <div className="border border-border rounded-md overflow-hidden">
            <ul className="m-0 p-0">
              {memories.map((memory) => (
                <MemoryRow
                  key={memory.id}
                  ref={null}
                  memory={memory}
                  selected={selectedId === memory.id}
                  focused={false}
                  confirming={confirmingId === memory.id}
                  onSelect={() => setSelectedId(selectedId === memory.id ? null : memory.id)}
                  onPin={() => void handlePin(memory)}
                  onDelete={() => {
                    void handleDelete(memory.id);
                    setConfirmingId(null);
                  }}
                  onDeleteStart={() => setConfirmingId(memory.id)}
                  onDeleteCancel={() => setConfirmingId(null)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
