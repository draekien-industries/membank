import { randomUUID } from "node:crypto";
import { classifyDuplicate } from "../domain/dedup-policy.js";
import type { Memory, SaveOptions } from "../domain/memory.js";
import { SaveOptionsSchema } from "../domain/memory.js";
import type { Embedder, MemoryRepository } from "../ports.js";

export async function saveMemory(
  opts: SaveOptions,
  deps: { repo: MemoryRepository; embedder: Embedder }
): Promise<Memory> {
  const { content, type, tags = [], projectScope, sourceHarness } = SaveOptionsSchema.parse(opts);
  const { repo, embedder } = deps;

  const embedding = await embedder.embed(content);

  const [top] = repo.findSimilar(embedding, type, projectScope?.hash);

  if (top !== undefined) {
    const decision = classifyDuplicate(top.similarity);

    if (decision === "overwrite") {
      return repo.overwrite(top.id, content, embedding);
    }

    if (decision === "flag") {
      const newMemory = repo.create({
        id: randomUUID(),
        content,
        type,
        tags,
        sourceHarness: sourceHarness ?? null,
        embedding,
        projectScope,
      });
      repo.createReviewEvent({
        memoryId: top.id,
        conflictingMemoryId: newMemory.id,
        similarity: top.similarity,
        conflictContentSnapshot: content,
      });
      return newMemory;
    }
  }

  return repo.create({
    id: randomUUID(),
    content,
    type,
    tags,
    sourceHarness: sourceHarness ?? null,
    embedding,
    projectScope,
  });
}
