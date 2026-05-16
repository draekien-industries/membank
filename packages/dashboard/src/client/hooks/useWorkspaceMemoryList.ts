import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { memoriesCollection } from "@/lib/collections";
import type { Memory } from "@/lib/types";
import { Route as WorkspaceRoute } from "@/routes/$projectId";

export function useWorkspaceMemoryList(selectedId: string | null) {
  const { projectId } = WorkspaceRoute.useParams();
  const search = WorkspaceRoute.useSearch();
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState(search.search);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);

  const { data: allMemories = [], isLoading } = useLiveQuery(
    (q) => q.from({ m: memoriesCollection }).orderBy(({ m }) => m.createdAt, "desc"),
    []
  );

  let filtered = allMemories.filter((m: Memory) => m.projects.some((p) => p.id === projectId));
  if (search.type) filtered = filtered.filter((m) => m.type === search.type);
  if (search.pinned) filtered = filtered.filter((m) => m.pinned);
  if (search.needsReview) filtered = filtered.filter((m) => m.reviewEvents.length > 0);
  if (search.search) {
    const q = search.search.toLowerCase();
    filtered = filtered.filter((m) => m.content.toLowerCase().includes(q));
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (filtered.length === 0) setFocusedIndex(-1);
    else if (focusedIndex >= filtered.length) setFocusedIndex(filtered.length - 1);
  }, [filtered.length, focusedIndex]);

  useEffect(() => {
    if (focusedIndex >= 0) rowRefs.current[focusedIndex]?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void navigate({
        to: "/$projectId",
        params: { projectId },
        search: (prev) => ({ ...prev, search: value }),
      });
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
      void navigate({ to: "/$projectId", params: { projectId }, search: (prev) => prev });
    }
  };

  const handleSelect = (id: string) => {
    const idx = filtered.findIndex((m) => m.id === id);
    if (idx >= 0) setFocusedIndex(idx);
    if (selectedId === id) {
      void navigate({ to: "/$projectId", params: { projectId }, search: (prev) => prev });
    } else {
      void navigate({
        to: "/$projectId/$memoryId",
        params: { projectId, memoryId: id },
        search: (prev) => prev,
      });
    }
  };

  const hasActiveFilters = !!(search.search || search.type || search.pinned || search.needsReview);

  const handleClearFilters = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSearchInput("");
    void navigate({
      to: "/$projectId",
      params: { projectId },
      search: (prev) => ({ tab: prev.tab }),
    });
  };

  return {
    projectId,
    search,
    searchInput,
    inputRef,
    isLoading,
    filtered,
    focusedIndex,
    setFocusedIndex,
    confirmingId,
    setConfirmingId,
    rowRefs,
    hasActiveFilters,
    handleSearchChange,
    handleClearFilters,
    handlePin,
    handleDelete,
    handleSelect,
  };
}
