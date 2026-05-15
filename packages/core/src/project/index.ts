export {
  GLOBAL_PROJECT_ID,
  GLOBAL_PROJECT_NAME,
  GLOBAL_SCOPE_HASH,
} from "./domain/global-scope.js";
export { createProjectRepository } from "./infrastructure/sqlite-project-repository.js";
export type { ProjectRepository } from "./ports.js";
