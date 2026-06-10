import type { Project } from "../../schemas.js";
import { resolveLegacyCwdScope, resolveProject } from "../../scope/index.js";
import type { ProjectRepository } from "../ports.js";

export interface WorktreeOrphan {
  orphan: Project;
  target: { hash: string; name: string; origin: string };
}

export async function findWorktreeOrphan(
  projects: ProjectRepository
): Promise<WorktreeOrphan | null> {
  const legacy = await resolveLegacyCwdScope();
  if (legacy === null) return null;

  const target = await resolveProject();
  if (legacy.hash === target.hash) return null;

  const orphan = projects.getByHash(legacy.hash);
  if (orphan === undefined) return null;

  return { orphan, target };
}
