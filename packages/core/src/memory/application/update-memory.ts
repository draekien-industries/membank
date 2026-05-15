import type { ActivityLogger } from "../../activity/ports.js";
import { noopActivityLogger } from "../../activity/ports.js";
import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import type { Memory, MemoryPatch } from "../domain/memory.js";
import { MemoryPatchSchema } from "../domain/memory.js";
import type { Embedder, MemoryRepository } from "../ports.js";

export async function updateMemory(
  id: string,
  patch: MemoryPatch,
  deps: { repo: MemoryRepository; embedder: Embedder; activityLogger?: ActivityLogger }
): Promise<Memory> {
  const { repo, embedder, activityLogger = noopActivityLogger } = deps;
  const parsed = MemoryPatchSchema.parse(patch);
  const newEmbedding =
    parsed.content !== undefined ? await embedder.embed(parsed.content) : undefined;
  const updated = repo.update(id, parsed, newEmbedding);
  const scope = updated.projects[0]?.scopeHash ?? GLOBAL_SCOPE_HASH;
  activityLogger.logEvent({ projectHash: scope, eventType: "memory.updated", memoryId: id });
  return updated;
}
