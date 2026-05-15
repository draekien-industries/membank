import type { ActivityLogger } from "../activity/ports.js";
import { noopActivityLogger } from "../activity/ports.js";
import type { DatabaseManager } from "../db/manager.js";
import type { Embedder, MemoryRepository } from "../memory/ports.js";
import type { QueryOptions } from "../types.js";
import { queryMemories } from "./application/query-memories.js";
import { SqliteQueryAdapter } from "./infrastructure/sqlite-query-adapter.js";
import type { Querier, ScoredMemory } from "./ports.js";

export class QueryEngine implements Querier {
  readonly #db: DatabaseManager;
  readonly #embedding: Embedder;
  readonly #repo: MemoryRepository;
  readonly #activityLogger: ActivityLogger;

  constructor(
    db: DatabaseManager,
    embeddingService: Embedder,
    repo: MemoryRepository,
    activityLogger: ActivityLogger = noopActivityLogger
  ) {
    this.#db = db;
    this.#embedding = embeddingService;
    this.#repo = repo;
    this.#activityLogger = activityLogger;
  }

  async query(options: QueryOptions): Promise<ScoredMemory[]> {
    const adapter = new SqliteQueryAdapter(this.#db);
    return queryMemories(options, {
      adapter,
      repo: this.#repo,
      embedder: this.#embedding,
      activityLogger: this.#activityLogger,
    });
  }
}
