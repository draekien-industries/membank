import type { MemoryRepository } from "../../memory/index.js";
import { GLOBAL_PROJECT_ID } from "../domain/global-scope.js";
import type { ProjectRepository } from "../ports.js";

export function deleteProject(
  projectId: string,
  projects: ProjectRepository,
  memories: MemoryRepository
): { deletedMemories: number } {
  if (projectId === GLOBAL_PROJECT_ID) {
    throw new Error("Cannot delete the global project");
  }

  const exclusiveIds = projects.listExclusiveMemoryIds(projectId);
  for (const id of exclusiveIds) {
    memories.delete(id);
  }
  projects.deleteById(projectId);

  return { deletedMemories: exclusiveIds.length };
}
