import type { ActivityLogger } from "../activity/ports.js";
import { noopActivityLogger } from "../activity/ports.js";
import type { DatabaseManager } from "../db/manager.js";
import type { Embedder } from "../memory/ports.js";
import { QueryEngine } from "./engine.js";
import { SqliteQueryAdapter } from "./infrastructure/sqlite-query-adapter.js";

export { queryMemories } from "./application/query-memories.js";
export { QueryEngine } from "./engine.js";
export type { Querier, QueryAdapter, ScoredMemory } from "./ports.js";

export function createQueryEngine(
  db: DatabaseManager,
  embedder: Embedder,
  activityLogger: ActivityLogger = noopActivityLogger
): QueryEngine {
  return new QueryEngine(new SqliteQueryAdapter(db), embedder, activityLogger);
}
