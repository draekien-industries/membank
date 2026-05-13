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

  constructor(db: DatabaseManager, embeddingService: Embedder, repo: MemoryRepository) {
    this.#db = db;
    this.#embedding = embeddingService;
    this.#repo = repo;
  }

  async query(options: QueryOptions): Promise<ScoredMemory[]> {
    const adapter = new SqliteQueryAdapter(this.#db);
    return queryMemories(options, { adapter, repo: this.#repo, embedder: this.#embedding });
  }
}
