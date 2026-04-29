import { MagnifyingGlass, PushPin, Warning } from "@phosphor-icons/react";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { MemoryRow } from "@/components/MemoryRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { memoriesCollection } from "@/lib/collections";
import type { MemoryType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Route as MemoriesRoute } from "@/routes/memories";

const TYPES: MemoryType[] = ["correction", "preference", "decision", "learning", "fact"];

interface MemoryListProps {
  selectedId: string | null;
}

export function MemoryList({ selectedId }: MemoryListProps) {
  const search = MemoriesRoute.useSearch();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState(search.search);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: allMemories = [], isLoading } = useLiveQuery(
    (q) => q.from({ m: memoriesCollection }).orderBy(({ m }) => m.createdAt, "desc"),
    []
  );

  const memories = useMemo(() => {
    let ms = allMemories;
    if (search.type) ms = ms.filter((m) => m.type === search.type);
    if (search.pinned) ms = ms.filter((m) => m.pinned);
    if (search.needsReview) ms = ms.filter((m) => m.needsReview);
    if (search.search) {
      const q = search.search.toLowerCase();
      ms = ms.filter((m) => m.content.toLowerCase().includes(q));
    }
    return ms;
  }, [allMemories, search]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void navigate({ to: "/memories", search: (prev) => ({ ...prev, search: value }) });
    }, 300);
  };

  const handlePin = (id: string, pinned: boolean) => {
    memoriesCollection.update(id, (draft) => {
      draft.pinned = !pinned;
    });
  };

  const handleDelete = (id: string) => {
    memoriesCollection.delete(id);
    if (selectedId === id) {
      void navigate({ to: "/memories" });
    }
  };

  const handleSelect = (id: string) => {
    if (selectedId === id) {
      void navigate({ to: "/memories" });
    } else {
      void navigate({ to: "/memories/$id", params: { id } });
    }
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
          value={search.type ?? ""}
          onChange={(e) =>
            void navigate({
              to: "/memories",
              search: (prev) => ({
                ...prev,
                type: e.target.value ? (e.target.value as MemoryType) : undefined,
              }),
            })
          }
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
          variant={search.pinned ? "default" : "ghost"}
          size="icon-sm"
          onClick={() =>
            void navigate({
              to: "/memories",
              search: (prev) => ({ ...prev, pinned: !prev.pinned }),
            })
          }
          aria-label="Pinned only"
          aria-pressed={search.pinned}
        >
          <PushPin weight={search.pinned ? "fill" : "regular"} />
        </Button>
        <Button
          variant={search.needsReview ? "destructive" : "ghost"}
          size="icon-sm"
          onClick={() =>
            void navigate({
              to: "/memories",
              search: (prev) => ({ ...prev, needsReview: !prev.needsReview }),
            })
          }
          aria-label="Needs review only"
          aria-pressed={search.needsReview}
        >
          <Warning weight={search.needsReview ? "fill" : "regular"} />
        </Button>
      </div>

      {/* Memory rows */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && allMemories.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            Loading…
          </div>
        )}
        {!isLoading && memories.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            No memories found
          </div>
        )}
        {memories.map((memory) => (
          <MemoryRow
            key={memory.id}
            memory={memory}
            selected={selectedId === memory.id}
            onSelect={() => handleSelect(memory.id)}
            onPin={() => handlePin(memory.id, memory.pinned)}
            onDelete={() => handleDelete(memory.id)}
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
