import type { Memory, MemoryPatch } from "../domain/memory.js";
import { MemoryPatchSchema } from "../domain/memory.js";
import type { Embedder, MemoryRepository } from "../ports.js";

export async function updateMemory(
  id: string,
  patch: MemoryPatch,
  deps: { repo: MemoryRepository; embedder: Embedder }
): Promise<Memory> {
  const { repo, embedder } = deps;
  const parsed = MemoryPatchSchema.parse(patch);
  const newEmbedding =
    parsed.content !== undefined ? await embedder.embed(parsed.content) : undefined;
  return repo.update(id, parsed, newEmbedding);
}
