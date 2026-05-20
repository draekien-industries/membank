import { randomUUID } from "node:crypto";
import type { ActivityLogger } from "../../activity/ports.js";
import { noopActivityLogger } from "../../activity/ports.js";
import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import { classifyDuplicate } from "../domain/dedup-policy.js";
import type { Memory, SaveOptions } from "../domain/memory.js";
import { SaveOptionsSchema } from "../domain/memory.js";
import type { Embedder, MemoryRepository } from "../ports.js";

export async function saveMemory(
  opts: SaveOptions,
  deps: { repo: MemoryRepository; embedder: Embedder; activityLogger?: ActivityLogger }
): Promise<Memory> {
  const { content, type, tags = [], projectScope, sourceHarness } = SaveOptionsSchema.parse(opts);
  const { repo, embedder, activityLogger = noopActivityLogger } = deps;
  const scope = projectScope?.hash ?? GLOBAL_SCOPE_HASH;

  const embedding = await embedder.embed(content);

  const [top] = repo.findSimilar(embedding, type, projectScope?.hash);

  if (top !== undefined) {
    const decision = classifyDuplicate(top.similarity);

    if (decision === "overwrite") {
      const updated = repo.overwrite(top.id, content, embedding);
      activityLogger.logEvent({
        projectHash: scope,
        eventType: "memory.updated",
        memoryId: top.id,
      });
      return updated;
    }

    if (decision === "flag") {
      const newMemory = repo.create({
        id: randomUUID(),
        content,
        type,
        tags,
        sourceHarness: sourceHarness ?? null,
        embedding,
        ...(projectScope !== undefined && { projectScope }),
      });
      repo.createReviewEvent({
        memoryId: top.id,
        conflictingMemoryId: newMemory.id,
        similarity: top.similarity,
        conflictContentSnapshot: content,
      });
      activityLogger.logEvent({
        projectHash: scope,
        eventType: "memory.created",
        memoryId: newMemory.id,
        payload: { contentSnapshot: content.slice(0, 1000), memoryType: type },
      });
      activityLogger.logEvent({
        projectHash: scope,
        eventType: "memory.flagged",
        memoryId: top.id,
        payload: {
          conflictingMemoryId: newMemory.id,
          similarity: top.similarity,
          conflictSnapshot: content.slice(0, 1000),
        },
      });
      return newMemory;
    }
  }

  const created = repo.create({
    id: randomUUID(),
    content,
    type,
    tags,
    sourceHarness: sourceHarness ?? null,
    embedding,
    ...(projectScope !== undefined && { projectScope }),
  });
  activityLogger.logEvent({
    projectHash: scope,
    eventType: "memory.created",
    memoryId: created.id,
    payload: { contentSnapshot: content.slice(0, 1000), memoryType: type },
  });
  return created;
}
