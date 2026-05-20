import type { ActivityLogger } from "../../activity/ports.js";
import { noopActivityLogger } from "../../activity/ports.js";
import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import type { MemoryRepository } from "../ports.js";

export function deleteMemory(
  id: string,
  repo: MemoryRepository,
  activityLogger: ActivityLogger = noopActivityLogger
): Promise<void> {
  const memory = repo.findById(id);
  const scope = memory?.projects[0]?.scopeHash ?? GLOBAL_SCOPE_HASH;
  repo.delete(id);
  activityLogger.logEvent({
    projectHash: scope,
    eventType: "memory.deleted",
    memoryId: id,
    payload: {
      ...(memory !== undefined && {
        contentSnapshot: memory.content.slice(0, 1000),
        memoryType: memory.type,
      }),
    },
  });
  return Promise.resolve();
}
