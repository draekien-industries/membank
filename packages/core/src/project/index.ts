export { deleteProject } from "./application/delete-project.js";
export type { WorktreeOrphan } from "./application/find-worktree-orphan.js";
export { findWorktreeOrphan } from "./application/find-worktree-orphan.js";
export type { MergeProjectsResult } from "./application/merge-projects.js";
export { mergeProjects } from "./application/merge-projects.js";
export { reconcileWorktreeOrphan } from "./application/reconcile-worktree-orphan.js";
export {
  GLOBAL_PROJECT_ID,
  GLOBAL_PROJECT_NAME,
  GLOBAL_SCOPE_HASH,
} from "./domain/global-scope.js";
export { createProjectRepository } from "./infrastructure/sqlite-project-repository.js";
export type { ProjectRepository } from "./ports.js";
