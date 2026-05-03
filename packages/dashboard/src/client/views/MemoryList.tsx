import { MagnifyingGlass, PushPin, Warning } from "@phosphor-icons/react";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { MemoryRow } from "@/components/MemoryRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { memoriesCollection, projectsCollection } from "@/lib/collections";
import type { Memory, MemoryType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Route as MemoriesRoute } from "@/routes/memories";

const TYPES: MemoryType[] = ["correction", "preference", "decision", "learning", "fact"];

interface MemoryListProps {
  selectedId: string | null;
}

interface Group {
  label: string;
  projectId: string | null;
  memories: Memory[];
}

export function MemoryList({ selectedId }: MemoryListProps) {
  const search = MemoriesRoute.useSearch();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState(search.search);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const { data: allMemories = [], isLoading } = useLiveQuery(
    (q) => q.from({ m: memoriesCollection }).orderBy(({ m }) => m.createdAt, "desc"),
    []
  );

  const { data: allProjects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);

  const filtered = useMemo(() => {
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

  const groups = useMemo((): Group[] => {
    const { projectId } = search;

    if (projectId === "global") {
      return [
        {
          label: "Global",
          projectId: null,
          memories: filtered.filter((m) => m.projects.length === 0),
        },
      ];
    }

    if (projectId !== undefined) {
      const project = allProjects.find((p) => p.id === projectId);
      const memories = filtered.filter((m) => m.projects.some((p) => p.id === projectId));
      return [{ label: project?.name ?? projectId, projectId, memories }];
    }

    const result: Group[] = [];

    const globalMemories = filtered.filter((m) => m.projects.length === 0);
    if (globalMemories.length > 0) {
      result.push({ label: "Global", projectId: null, memories: globalMemories });
    }

    for (const project of [...allProjects].sort((a, b) => a.name.localeCompare(b.name))) {
      const memories = filtered.filter((m) => m.projects.some((p) => p.id === project.id));
      if (memories.length > 0) {
        result.push({ label: project.name, projectId: project.id, memories });
      }
    }

    return result;
  }, [filtered, allProjects, search]);

  const totalCount = useMemo(() => {
    const seen = new Set<string>();
    let count = 0;
    for (const g of groups) {
      for (const m of g.memories) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          count++;
        }
      }
    }
    return count;
  }, [groups]);

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
    if (selectedId === id) void navigate({ to: "/memories" });
  };

  const handleSelect = (id: string) => {
    if (selectedId === id) {
      void navigate({ to: "/memories" });
    } else {
      void navigate({ to: "/memories/$id", params: { id } });
    }
  };

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
        <div className="relative flex-1">
          <MagnifyingGlass
            weight="regular"
            className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none"
          />
          <Input
            ref={inputRef}
            placeholder="Search…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-6"
            title="Press / to focus"
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
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
            className="w-24"
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0]?.toUpperCase()}
                {t.slice(1)}
              </option>
            ))}
          </Select>
          <Select
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
            className="w-28"
          >
            <option value="">All projects</option>
            <option value="global">Global</option>
            {[...allProjects]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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
      </div>

      {/* Memory rows grouped */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && allMemories.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            Loading…
          </div>
        )}
        {!isLoading && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 px-6 text-center">
            {allMemories.length === 0 ? (
              <>
                <p className="text-xs text-muted-foreground">No memories yet</p>
                <p className="text-[10px] text-muted-foreground max-w-48">
                  Memories are saved automatically by AI coding tools. Run{" "}
                  <code className="font-mono">membank setup</code> to connect your tools.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No memories match the current filters</p>
            )}
          </div>
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
                  {group.memories.map((memory) => (
                    <MemoryRow
                      key={`${group.label}-${memory.id}`}
                      memory={memory}
                      selected={selectedId === memory.id}
                      onSelect={() => handleSelect(memory.id)}
                      onPin={() => handlePin(memory.id, memory.pinned)}
                      onDelete={() => handleDelete(memory.id)}
                    />
                  ))}
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
    </div>
  );
}
