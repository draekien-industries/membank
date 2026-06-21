import type { ActivityLogger } from "../../activity/ports.js";
import { noopActivityLogger } from "../../activity/ports.js";
import type { MemoryQueryScope } from "../../capability/domain/memory-target.js";
import type { Embedder } from "../../memory/ports.js";
import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import type { MemoryType } from "../../schemas.js";
import { QueryFieldsSchema } from "../../schemas.js";
import { computeScore } from "../domain/scoring.js";
import type { QueryAdapter, ScoredMemory } from "../ports.js";

export type QueryOptions = {
  query: string;
  type?: MemoryType;
  limit?: number;
  includePinned?: boolean;
  scope: MemoryQueryScope;
};

export async function queryMemories(
  options: QueryOptions,
  deps: {
    adapter: QueryAdapter;
    embedder: Embedder;
    activityLogger?: ActivityLogger;
  }
): Promise<ScoredMemory[]> {
  const { query, type, limit = 10, includePinned } = QueryFieldsSchema.parse(options);
  const { activityLogger = noopActivityLogger } = deps;
  const scopeFilter = toScopeFilter(options.scope);

  const queryEmbedding = await deps.embedder.embed(query);

  const rows = deps.adapter.findByEmbedding(queryEmbedding, {
    ...(type !== undefined && { type }),
    ...scopeFilter,
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
    deps.adapter.incrementAccessCount(result.id);
  }

  activityLogger.logEvent({
    projectHash: scopeFilter.projectHash ?? GLOBAL_SCOPE_HASH,
    eventType: "memory.queried",
    payload: {
      query,
      resultCount: results.length,
      topScores: results.slice(0, 3).map((r) => r.score),
    },
  });

  return results;
}

function toScopeFilter(scope: MemoryQueryScope): { projectHash?: string; capabilityKey?: string } {
  switch (scope.tag) {
    case "current":
      return { projectHash: scope.projectHash };
    case "global":
      return { projectHash: GLOBAL_SCOPE_HASH };
    case "all":
      return {};
    case "capability":
      return { capabilityKey: scope.key.toString() };
    default: {
      const _exhaustive: never = scope;
      throw new Error(`Unhandled query scope: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
