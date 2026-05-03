import type { ProjectRepository } from "../project/index.js";
import { resolveProject } from "../scope/index.js";

export interface MigrationMeta {
  name: string;
  description: string;
}

export interface ScopeToProjectsResult {
  migration: "scope-to-projects";
  oldName: string;
  newName: string;
  memoryCount: number;
}

export const MIGRATIONS: MigrationMeta[] = [
  {
    name: "scope-to-projects",
    description:
      "Rename the auto-migrated project for the current directory from its generic hash-derived name to the resolved repo/directory name.",
  },
];

export async function runScopeToProjectsMigration(
  projects: ProjectRepository
): Promise<ScopeToProjectsResult | null> {
  const resolved = await resolveProject();
  const project = projects.getByHash(resolved.hash);

  if (project === undefined) {
    return null;
  }

  const oldName = project.name;
  const memoryCount = projects.countMemories(project.id);
  projects.rename(project.id, resolved.name);

  return {
    migration: "scope-to-projects",
    oldName,
    newName: resolved.name,
    memoryCount,
  };
}
