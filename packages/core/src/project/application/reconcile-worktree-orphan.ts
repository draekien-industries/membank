import type { ProjectRepository } from "../ports.js";
import { findWorktreeOrphan } from "./find-worktree-orphan.js";
import { type MergeProjectsResult, mergeProjects } from "./merge-projects.js";

export async function reconcileWorktreeOrphan(
  projects: ProjectRepository
): Promise<MergeProjectsResult | null> {
  const found = await findWorktreeOrphan(projects);
  if (found === null) return null;

  const target = projects.upsertByHash(found.target.hash, found.target.name, found.target.origin);
  return mergeProjects(found.orphan.id, target.id, projects);
}
