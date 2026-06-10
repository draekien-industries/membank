import type { ProjectRepository } from "../ports.js";

export interface MergeProjectsResult {
  movedMemories: number;
  source: { id: string; name: string };
  target: { id: string; name: string };
}

export function mergeProjects(
  sourceId: string,
  targetId: string,
  projects: ProjectRepository
): MergeProjectsResult {
  const source = projects.getById(sourceId);
  if (source === undefined) throw new Error(`Project not found: ${sourceId}`);
  const target = projects.getById(targetId);
  if (target === undefined) throw new Error(`Project not found: ${targetId}`);

  const { movedMemories } = projects.merge(sourceId, targetId);

  return {
    movedMemories,
    source: { id: source.id, name: source.name },
    target: { id: target.id, name: target.name },
  };
}
