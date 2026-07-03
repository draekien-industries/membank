import { GLOBAL_SCOPE_HASH } from "@membank/core/client";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { countReviewClusters } from "@/hooks/useStats";
import { memoriesCollection } from "@/lib/collections";
import type { Memory, MemoryType, Project } from "@/lib/types";
import { MEMORY_TYPES } from "@/lib/types";

export interface ProjectRow {
  project: Project;
  total: number;
  byType: Record<MemoryType, number>;
  newInWindow: number;
  flaggedCount: number;
  lastUpdated: string | null;
}

function belongsToProject(memory: Memory, project: Project): boolean {
  if (memory.projects.some((p) => p.id === project.id)) return true;
  return project.scopeHash === GLOBAL_SCOPE_HASH && memory.projects.length === 0;
}

function buildRow(project: Project, memories: Memory[], days: number): ProjectRow {
  const projectMemories = memories.filter((m) => belongsToProject(m, project));

  const byType = {} as Record<MemoryType, number>;
  for (const type of MEMORY_TYPES) byType[type] = 0;

  const windowStart = Date.now() - days * 24 * 60 * 60 * 1000;
  let newInWindow = 0;
  let lastUpdated: string | null = null;

  for (const m of projectMemories) {
    byType[m.type as MemoryType]++;
    if (new Date(m.createdAt).getTime() >= windowStart) newInWindow++;
    if (lastUpdated === null || m.updatedAt > lastUpdated) lastUpdated = m.updatedAt;
  }

  return {
    project,
    total: projectMemories.length,
    byType,
    newInWindow,
    flaggedCount: countReviewClusters(projectMemories),
    lastUpdated,
  };
}

function compareRows(a: ProjectRow, b: ProjectRow): number {
  const aFlagged = a.flaggedCount > 0;
  const bFlagged = b.flaggedCount > 0;
  if (aFlagged !== bFlagged) return aFlagged ? -1 : 1;

  if (a.lastUpdated !== b.lastUpdated) {
    if (a.lastUpdated === null) return 1;
    if (b.lastUpdated === null) return -1;
    return b.lastUpdated.localeCompare(a.lastUpdated);
  }

  return a.project.name.localeCompare(b.project.name);
}

export function useProjectRows(projects: Project[], days: number): ProjectRow[] {
  const { data: allMemories = [] } = useLiveQuery((q) => q.from({ m: memoriesCollection }), []);

  return useMemo(
    () => projects.map((project) => buildRow(project, allMemories, days)).sort(compareRows),
    [projects, allMemories, days]
  );
}

export function useProjectRow(project: Project, days: number): ProjectRow {
  const { data: allMemories = [] } = useLiveQuery((q) => q.from({ m: memoriesCollection }), []);

  return useMemo(() => buildRow(project, allMemories, days), [project, allMemories, days]);
}
