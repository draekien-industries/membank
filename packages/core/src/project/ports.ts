import type { Project } from "../schemas.js";

export interface ProjectRepository {
  upsertByHash(hash: string, name: string, origin?: string): Project;
  rename(id: string, name: string): Project;
  list(): Project[];
  getById(id: string): Project | undefined;
  getByHash(hash: string): Project | undefined;
  getByName(name: string): Project | undefined;
  addAssociation(memoryId: string, projectId: string): void;
  removeAssociation(memoryId: string, projectId: string): void;
  countMemories(projectId: string): number;
  getProjectsForMemories(memoryIds: string[]): Map<string, Project[]>;
  merge(sourceId: string, targetId: string): { movedMemories: number };
  listExclusiveMemoryIds(projectId: string): string[];
  deleteById(id: string): void;
}
