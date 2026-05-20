import type { ActivityLogger } from "../../activity/ports.js";
import { noopActivityLogger } from "../../activity/ports.js";
import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import type { Memory } from "../domain/memory.js";
import type { Embedder, MemoryRepository } from "../ports.js";

export async function revertMemory(
  id: string,
  version: number,
  deps: { repo: MemoryRepository; embedder: Embedder; activityLogger?: ActivityLogger }
): Promise<Memory> {
  const { repo, embedder, activityLogger = noopActivityLogger } = deps;

  const target = repo.getVersion(id, version);
  if (target === undefined) {
    throw new Error(`Version ${version} not found for memory: ${id}`);
  }

  const embedding = await embedder.embed(target.content);
  const updated = repo.update(id, { content: target.content }, embedding);
  const scope = updated.projects[0]?.scopeHash ?? GLOBAL_SCOPE_HASH;
  activityLogger.logEvent({
    projectHash: scope,
    eventType: "memory.updated",
    memoryId: id,
    payload: {
      revertedToVersion: version,
      contentSnapshot: updated.content.slice(0, 1000),
      memoryType: updated.type,
    },
  });
  return updated;
}
