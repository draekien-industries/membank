import { MagnifyingGlass, PushPin, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MemoryRow } from "@/components/MemoryRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { deleteMemory, listMemories, patchMemory } from "@/lib/api";
import type { Filters, Memory, MemoryType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPES: MemoryType[] = ["correction", "preference", "decision", "learning", "fact"];

interface MemoryListProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRefreshStats: () => void;
}

export function MemoryList({ selectedId, onSelect, onRefreshStats }: MemoryListProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    type: "",
    pinned: false,
    needsReview: false,
  });
  const [loading, setLoading] = useState(true);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchInput, setSearchInput] = useState("");

  const fetch = useCallback(async (f: Filters) => {
    setLoading(true);
    try {
      const data = await listMemories(f);
      setMemories(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch(filters);
  }, [filters, fetch]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setFilters((f: Filters) => ({ ...f, search: value }));
    }, 300);
  };

  const handlePin = async (memory: Memory) => {
    const updated = await patchMemory(memory.id, { pinned: !memory.pinned });
    setMemories((ms) => ms.map((m) => (m.id === updated.id ? updated : m)));
    onRefreshStats();
  };

  const handleDelete = async (id: string) => {
    await deleteMemory(id);
    setMemories((ms) => ms.filter((m) => m.id !== id));
    if (selectedId === id) onSelect(null);
    onRefreshStats();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
        <div className="relative flex-1 max-w-64">
          <MagnifyingGlass
            weight="regular"
            className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none"
          />
          <Input
            placeholder="Search memories…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-6"
          />
        </div>
        <Select
          value={filters.type}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as MemoryType | "" }))}
          className="w-28"
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t[0]?.toUpperCase()}
              {t.slice(1)}
            </option>
          ))}
        </Select>
        <Button
          variant={filters.pinned ? "default" : "ghost"}
          size="icon-sm"
          onClick={() => setFilters((f) => ({ ...f, pinned: !f.pinned }))}
          aria-label="Pinned only"
          aria-pressed={filters.pinned}
        >
          <PushPin weight={filters.pinned ? "fill" : "regular"} />
        </Button>
        <Button
          variant={filters.needsReview ? "destructive" : "ghost"}
          size="icon-sm"
          onClick={() => setFilters((f) => ({ ...f, needsReview: !f.needsReview }))}
          aria-label="Needs review only"
          aria-pressed={filters.needsReview}
        >
          <Warning weight={filters.needsReview ? "fill" : "regular"} />
        </Button>
      </div>

      {/* Memory rows */}
      <div className="flex-1 overflow-y-auto">
        {loading && memories.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            Loading…
          </div>
        )}
        {!loading && memories.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            No memories found
          </div>
        )}
        {memories.map((memory) => (
          <MemoryRow
            key={memory.id}
            memory={memory}
            selected={selectedId === memory.id}
            onSelect={() => onSelect(selectedId === memory.id ? null : memory.id)}
            onPin={() => void handlePin(memory)}
            onDelete={() => void handleDelete(memory.id)}
          />
        ))}
      </div>

      {/* Count */}
      {memories.length > 0 && (
        <div
          className={cn(
            "px-4 py-2 border-t border-border shrink-0",
            "text-[10px] text-muted-foreground"
          )}
        >
          {memories.length} {memories.length === 1 ? "memory" : "memories"}
        </div>
      )}
    </div>
  );
}
