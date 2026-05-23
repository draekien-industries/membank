import type { ActivityLogger } from "../../activity/ports.js";
import { noopActivityLogger } from "../../activity/ports.js";
import type { Embedder, MemoryRepository } from "../../memory/ports.js";
import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import type { QueryOptions } from "../../schemas.js";
import { QueryOptionsSchema } from "../../schemas.js";
import { computeScore } from "../domain/scoring.js";
import type { QueryAdapter, ScoredMemory } from "../ports.js";

export async function queryMemories(
  options: QueryOptions,
  deps: {
    adapter: QueryAdapter;
    repo: Pick<MemoryRepository, "incrementAccessCount">;
    embedder: Embedder;
    activityLogger?: ActivityLogger;
  }
): Promise<ScoredMemory[]> {
  const { query, type, projectHash, limit = 10, includePinned } = QueryOptionsSchema.parse(options);
  const { activityLogger = noopActivityLogger } = deps;

  const queryEmbedding = await deps.embedder.embed(query);
  const queryBlob = Buffer.from(queryEmbedding.buffer);

  const rows = deps.adapter.findByEmbedding(queryBlob, {
    ...(type !== undefined && { type }),
    ...(projectHash !== undefined && { projectHash }),
    ...(includePinned !== undefined && { includePinned }),
  });

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

  activityLogger.logEvent({
    projectHash: projectHash ?? GLOBAL_SCOPE_HASH,
    eventType: "memory.queried",
    payload: {
      query,
      resultCount: results.length,
      topScores: results.slice(0, 3).map((r) => r.score),
    },
  });

  return results;
}
