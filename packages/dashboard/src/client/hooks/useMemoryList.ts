import { useLiveQuery } from "@tanstack/react-db";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { memoriesCollection, projectsCollection } from "@/lib/collections";
import type { Memory } from "@/lib/types";
import { Route as MemoriesRoute } from "@/routes/memories";

interface Group {
  label: string;
  projectId: string | null;
  memories: Memory[];
}

export function useMemoryList(selectedId: string | null) {
  const search = MemoriesRoute.useSearch();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState(search.search);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);

  const { data: allMemories = [], isLoading } = useLiveQuery(
    (q) => q.from({ m: memoriesCollection }).orderBy(({ m }) => m.createdAt, "desc"),
    []
  );

  const { data: allProjects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);

  const filtered = useMemo(() => {
    let ms = allMemories;
    if (search.type) ms = ms.filter((m) => m.type === search.type);
    if (search.pinned) ms = ms.filter((m) => m.pinned);
    if (search.needsReview) ms = ms.filter((m) => m.reviewEvents.length > 0);
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

  const flatMemories = useMemo(
    () => groups.flatMap((g) => (collapsedGroups.has(g.label) ? [] : g.memories)),
    [groups, collapsedGroups]
  );

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

  // Clamp focusedIndex when visible list shrinks
  useEffect(() => {
    if (flatMemories.length === 0) {
      setFocusedIndex(-1);
    } else if (focusedIndex >= flatMemories.length) {
      setFocusedIndex(flatMemories.length - 1);
    }
  }, [flatMemories.length, focusedIndex]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIndex >= 0) {
      rowRefs.current[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

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
    const idx = flatMemories.findIndex((m) => m.id === id);
    if (idx >= 0) setFocusedIndex(idx);
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

  const handleKeyDelete = () => {
    const mem = flatMemories[focusedIndex];
    if (!mem) return;
    if (confirmingId === mem.id) {
      handleDelete(mem.id);
      setConfirmingId(null);
    } else {
      setConfirmingId(mem.id);
    }
  };

  useHotkeys([
    {
      hotkey: "/",
      callback: () => {
        inputRef.current?.focus();
        inputRef.current?.select();
      },
      options: { preventDefault: true },
    },
    {
      hotkey: "ArrowUp",
      callback: () => {
        setFocusedIndex((i) => (i <= 0 ? flatMemories.length - 1 : i - 1));
      },
      options: { preventDefault: true, enabled: flatMemories.length > 0 },
    },
    {
      hotkey: "ArrowDown",
      callback: () => {
        setFocusedIndex((i) => (i < 0 || i >= flatMemories.length - 1 ? 0 : i + 1));
      },
      options: { preventDefault: true, enabled: flatMemories.length > 0 },
    },
    {
      hotkey: "Enter",
      callback: () => {
        const mem = flatMemories[focusedIndex];
        if (mem) handleSelect(mem.id);
      },
      options: { enabled: focusedIndex >= 0 },
    },
    {
      hotkey: "P",
      callback: () => {
        const mem = flatMemories[focusedIndex];
        if (mem) handlePin(mem.id, mem.pinned);
      },
      options: { enabled: focusedIndex >= 0 },
    },
    {
      hotkey: "D",
      callback: handleKeyDelete,
      options: { enabled: focusedIndex >= 0 },
    },
    {
      hotkey: "Delete",
      callback: handleKeyDelete,
      options: { enabled: focusedIndex >= 0 },
    },
    {
      hotkey: "Escape",
      callback: () => {
        if (confirmingId) {
          setConfirmingId(null);
          return;
        }
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        if (selectedId) void navigate({ to: "/memories" });
      },
    },
    {
      hotkey: { key: "?", shift: true },
      callback: () => setShowShortcuts((v) => !v),
    },
  ]);

  return {
    search,
    searchInput,
    inputRef,
    allMemories,
    allProjects,
    isLoading,
    groups,
    totalCount,
    collapsedGroups,
    flatMemories,
    focusedIndex,
    confirmingId,
    setConfirmingId,
    showShortcuts,
    setShowShortcuts,
    rowRefs,
    handleSearchChange,
    handlePin,
    handleDelete,
    handleSelect,
    toggleGroup,
  };
}
