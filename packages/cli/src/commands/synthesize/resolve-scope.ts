import { createProjectRepository, type DatabaseManager, GLOBAL_SCOPE_HASH } from "@membank/core";

export function resolveScope(scope: string, db: ReturnType<typeof DatabaseManager.open>): string {
  if (scope === "global") return GLOBAL_SCOPE_HASH;
  if (/^[0-9a-f]{16}$/.test(scope)) return scope;
  const project = createProjectRepository(db).getByName(scope);
  return project !== undefined ? project.scopeHash : scope;
}
