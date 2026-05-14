import { Eraser, MagnifyingGlass } from "@phosphor-icons/react";
import { MemoryRow } from "@/components/MemoryRow";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { useWorkspaceMemoryList } from "@/hooks/useWorkspaceMemoryList";
import { cn } from "@/lib/utils";

interface WorkspaceCenterProps {
  selectedId: string | null;
}

export function WorkspaceCenter({ selectedId }: WorkspaceCenterProps) {
  const {
    search,
    searchInput,
    inputRef,
    isLoading,
    filtered,
    focusedIndex,
    confirmingId,
    setConfirmingId,
    rowRefs,
    hasActiveFilters,
    handleSearchChange,
    handleClearFilters,
    handlePin,
    handleDelete,
    handleSelect,
  } = useWorkspaceMemoryList(selectedId);

  return (
    <div className="flex flex-col h-full">
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {filtered.length} {filtered.length === 1 ? "memory" : "memories"}
        {search.search ? ` matching "${search.search}"` : ""}
      </div>

      <div className="flex items-center gap-1.5 px-3 pt-3 pb-2 border-b border-border shrink-0">
        <div className="relative flex-1 min-w-0">
          <MagnifyingGlass
            weight="regular"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
          />
          <Input
            ref={inputRef}
            placeholder="Search…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-7"
            title="Press / to focus"
          />
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleClearFilters}
            aria-label="Clear filters"
            title="Clear all filters"
          >
            <Eraser weight="regular" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && filtered.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs font-mono text-muted-foreground">
            Loading…
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <Empty className="border-0 rounded-none p-0 h-32">
            {search.search ? (
              <>
                <EmptyTitle className="text-xs font-mono font-normal">
                  No memories match &ldquo;{search.search}&rdquo;
                </EmptyTitle>
                <Button variant="link" size="sm" onClick={handleClearFilters}>
                  Clear search
                </Button>
              </>
            ) : (
              <EmptyTitle className="text-xs font-mono font-normal">
                No memories in this project
              </EmptyTitle>
            )}
            {(search.type || search.pinned || search.needsReview) && (
              <EmptyDescription className="text-[11px] font-mono">
                Filters are active — try clearing them in the left panel
              </EmptyDescription>
            )}
          </Empty>
        )}
        <ul className="m-0 p-0">
          {filtered.map((memory, idx) => (
            <MemoryRow
              key={memory.id}
              ref={(el) => {
                rowRefs.current[idx] = el;
              }}
              memory={memory}
              selected={selectedId === memory.id}
              focused={focusedIndex === idx}
              confirming={confirmingId === memory.id}
              onSelect={() => handleSelect(memory.id)}
              onPin={() => handlePin(memory.id, memory.pinned)}
              onDelete={() => {
                handleDelete(memory.id);
                setConfirmingId(null);
              }}
              onDeleteStart={() => setConfirmingId(memory.id)}
              onDeleteCancel={() => setConfirmingId(null)}
            />
          ))}
        </ul>
      </div>

      {filtered.length > 0 && (
        <div
          className={cn(
            "px-4 py-2 border-t border-border shrink-0",
            "text-[11px] font-mono text-muted-foreground"
          )}
        >
          {filtered.length} {filtered.length === 1 ? "memory" : "memories"}
        </div>
      )}
    </div>
  );
}
