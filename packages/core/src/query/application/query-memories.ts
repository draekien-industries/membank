import type { Embedder, MemoryRepository } from "../../memory/ports.js";
import { QueryOptionsSchema } from "../../schemas.js";
import type { QueryOptions } from "../../types.js";
import { computeScore } from "../domain/scoring.js";
import type { QueryAdapter, ScoredMemory } from "../ports.js";

export async function queryMemories(
  options: QueryOptions,
  deps: {
    adapter: QueryAdapter;
    repo: Pick<MemoryRepository, "incrementAccessCount">;
    embedder: Embedder;
  }
): Promise<ScoredMemory[]> {
  const { query, type, projectHash, limit = 10, includePinned } = QueryOptionsSchema.parse(options);

  const queryEmbedding = await deps.embedder.embed(query);
  const queryBlob = Buffer.from(queryEmbedding.buffer);

  const rows = deps.adapter.findByEmbedding(queryBlob, { type, projectHash, includePinned });

  const now = Date.now();
  const scored = rows
    .filter((row) => row.cosineSim > 0)
    .map((row) => {
      const { cosineSim, ...memory } = row;
      return { ...memory, score: computeScore(memory, cosineSim, now) };
    });

  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, limit);

  for (const result of results) {
    deps.repo.incrementAccessCount(result.id);
  }

  return results;
}
