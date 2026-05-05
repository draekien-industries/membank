import { Eraser, MagnifyingGlass, PushPin, Warning } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { MemoryRow } from "@/components/MemoryRow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useMemoryList } from "@/hooks/useMemoryList";
import type { MemoryType } from "@/lib/types";
import { MEMORY_TYPES, TYPE_DESCRIPTIONS } from "@/lib/types";
import { capitalize, cn } from "@/lib/utils";

const SHORTCUTS = [
  ["↑ / ↓", "Navigate list"],
  ["Enter", "Open memory"],
  ["P", "Pin / unpin"],
  ["D / Del", "Delete (confirm twice)"],
  ["Escape", "Close / cancel"],
  ["/", "Focus search"],
  ["?", "Toggle this help"],
] as const;

interface MemoryListProps {
  selectedId: string | null;
}

export function MemoryList({ selectedId }: MemoryListProps) {
  const navigate = useNavigate();
  const {
    search,
    searchInput,
    inputRef,
    allMemories,
    allProjects,
    isLoading,
    groups,
    totalCount,
    collapsedGroups,
    focusedIndex,
    confirmingId,
    setConfirmingId,
    showShortcuts,
    setShowShortcuts,
    rowRefs,
    hasActiveFilters,
    handleClearFilters,
    handleSearchChange,
    handlePin,
    handleDelete,
    handleSelect,
    toggleGroup,
  } = useMemoryList(selectedId);

  let flatIndex = 0;

  return (
    <div className="relative flex flex-col h-full">
      {/* ARIA live region for search result changes */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {totalCount} {totalCount === 1 ? "memory" : "memories"}
        {search.search ? ` matching "${search.search}"` : ""}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-1.5 px-4 pt-3 pb-2 border-b border-border shrink-0">
        {/* Search — primary row */}
        <div className="relative">
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
        {/* Filters — secondary row */}
        <div className="flex items-center gap-1.5">
          <NativeSelect
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
            size="sm"
            className="w-24"
          >
            <NativeSelectOption value="">All types</NativeSelectOption>
            {MEMORY_TYPES.map((t) => (
              <NativeSelectOption key={t} value={t} title={TYPE_DESCRIPTIONS[t]}>
                {capitalize(t)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            value={search.projectId ?? ""}
            onChange={(e) =>
              void navigate({
                to: "/memories",
                search: (prev) => ({
                  ...prev,
                  projectId: e.target.value || undefined,
                }),
              })
            }
            size="sm"
            className="w-28"
          >
            <NativeSelectOption value="">All projects</NativeSelectOption>
            <NativeSelectOption value="global">Global</NativeSelectOption>
            {[...allProjects]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
          <div className="ml-auto flex items-center gap-1">
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
              title="Show memories flagged for review — possible duplicates or conflicts"
            >
              <Warning weight={search.needsReview ? "fill" : "regular"} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowShortcuts((v) => !v)}
              aria-label="Keyboard shortcuts"
              aria-pressed={showShortcuts}
              title="Press ? for shortcuts"
            >
              <span className="text-[11px] font-mono font-bold">?</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Memory rows grouped */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && allMemories.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            Loading…
          </div>
        )}
        {!isLoading && groups.length === 0 && (
          <Empty className="border-0 rounded-none p-0 h-32">
            {allMemories.length === 0 ? (
              <>
                <EmptyTitle className="text-xs font-normal">No memories yet</EmptyTitle>
                <EmptyDescription className="max-w-48">
                  Memories are saved automatically by AI coding tools. Run{" "}
                  <code className="font-mono">membank setup</code> to connect your tools.
                </EmptyDescription>
              </>
            ) : (
              <>
                <EmptyTitle className="text-xs font-normal">
                  {search.search
                    ? `No memories match "${search.search}"`
                    : "No memories match the current filters"}
                </EmptyTitle>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => void navigate({ to: "/memories", search: {} })}
                >
                  Clear filters
                </Button>
              </>
            )}
          </Empty>
        )}
        {groups.map((group) => {
          const collapsed = collapsedGroups.has(group.label);
          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className={cn(
                  "sticky top-0 z-10 w-full flex items-center justify-between px-4 py-1.5",
                  "bg-background/95 backdrop-blur border-b border-border",
                  "text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                )}
              >
                <span>{group.label}</span>
                <span>{group.memories.length}</span>
              </button>
              {!collapsed && (
                <ul className="m-0 p-0">
                  {group.memories.map((memory) => {
                    const idx = flatIndex++;
                    return (
                      <MemoryRow
                        key={`${group.label}-${memory.id}`}
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
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Count */}
      {totalCount > 0 && (
        <div
          className={cn(
            "px-4 py-2 border-t border-border shrink-0",
            "text-[11px] text-muted-foreground"
          )}
        >
          {totalCount} {totalCount === 1 ? "memory" : "memories"}
        </div>
      )}

      {/* Keyboard shortcut overlay */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="min-w-56 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <dl className="space-y-2">
            {SHORTCUTS.map(([key, desc]) => (
              <div key={key} className="flex items-center gap-4">
                <dt className="shrink-0 min-w-20 text-right">
                  <Kbd>{key}</Kbd>
                </dt>
                <dd className="text-xs text-foreground">{desc}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}
