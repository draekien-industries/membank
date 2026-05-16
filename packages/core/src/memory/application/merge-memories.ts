import type { ActivityLogger } from "../../activity/ports.js";
import { noopActivityLogger } from "../../activity/ports.js";
import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import { classifyDuplicate } from "../domain/dedup-policy.js";
import type { Memory } from "../domain/memory.js";
import type { Embedder, MemoryRepository, MergeMemoriesOpts } from "../ports.js";

export interface MergeMemoriesResult {
  kept: Memory;
  dropped: string[];
}

export async function mergeMemories(
  opts: MergeMemoriesOpts,
  deps: { repo: MemoryRepository; embedder: Embedder; activityLogger?: ActivityLogger }
): Promise<MergeMemoriesResult> {
  const { keepId, dropIds, mergedContent } = opts;
  const { repo, embedder, activityLogger = noopActivityLogger } = deps;

  const keep = repo.findById(keepId);
  if (keep === undefined) throw new Error(`Memory not found: ${keepId}`);

  const drops = dropIds.map((id) => {
    const m = repo.findById(id);
    if (m === undefined) throw new Error(`Memory not found: ${id}`);
    return m;
  });

  for (const drop of drops) {
    if (drop.type !== keep.type) {
      throw new Error(
        `Type mismatch: keep memory has type "${keep.type}" but drop memory ${drop.id} has type "${drop.type}"`
      );
    }
  }

  const allMemories = [keep, ...drops];
  const unionTags = [...new Set(allMemories.flatMap((m) => m.tags))];
  const unionPinned = allMemories.some((m) => m.pinned);
  const totalAccess = allMemories.reduce((sum, m) => sum + m.accessCount, 0);

  const embedding = await embedder.embed(mergedContent);
  let kept = repo.overwrite(keepId, mergedContent, embedding);

  const keepTagSet = new Set(keep.tags);
  const tagsChanged =
    unionTags.length !== keep.tags.length || unionTags.some((t) => !keepTagSet.has(t));
  if (tagsChanged) {
    kept = repo.update(keepId, { tags: unionTags });
  }

  if (unionPinned && !keep.pinned) {
    kept = repo.setPin(keepId, true);
  }

  if (totalAccess > keep.accessCount) {
    const extra = totalAccess - keep.accessCount;
    for (let i = 0; i < extra; i++) repo.incrementAccessCount(keepId);
    kept = repo.findById(keepId) ?? kept;
  }

  for (const drop of drops) {
    repo.delete(drop.id);
  }

  // Re-run dedup so the merged memory gets flagged if it's near another existing memory
  const [top] = repo.findSimilar(embedding, keep.type, keep.projects[0]?.scopeHash);
  if (top !== undefined && top.id !== keepId && classifyDuplicate(top.similarity) === "flag") {
    repo.createReviewEvent({
      memoryId: keepId,
      conflictingMemoryId: top.id,
      similarity: top.similarity,
      conflictContentSnapshot: mergedContent,
    });
  }

  const scope = kept.projects[0]?.scopeHash ?? GLOBAL_SCOPE_HASH;
  activityLogger.logEvent({
    projectHash: scope,
    eventType: "memory.updated",
    memoryId: keepId,
    payload: { merged: dropIds },
  });

  kept = repo.findById(keepId) ?? kept;
  return { kept, dropped: dropIds };
}
