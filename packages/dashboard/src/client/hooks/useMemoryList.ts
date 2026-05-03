import { useLiveQuery } from "@tanstack/react-db";
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
    handleSearchChange,
    handlePin,
    handleDelete,
    handleSelect,
    toggleGroup,
  };
}
