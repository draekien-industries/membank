import type { ActivityLogger } from "../activity/ports.js";
import { noopActivityLogger } from "../activity/ports.js";
import type { Embedder } from "../memory/ports.js";
import { type QueryOptions, queryMemories } from "./application/query-memories.js";
import type { Querier, QueryAdapter, ScoredMemory } from "./ports.js";

export class QueryEngine implements Querier {
  readonly #adapter: QueryAdapter;
  readonly #embedding: Embedder;
  readonly #activityLogger: ActivityLogger;

  constructor(
    adapter: QueryAdapter,
    embeddingService: Embedder,
    activityLogger: ActivityLogger = noopActivityLogger
  ) {
    this.#adapter = adapter;
    this.#embedding = embeddingService;
    this.#activityLogger = activityLogger;
  }

  async query(options: QueryOptions): Promise<ScoredMemory[]> {
    return queryMemories(options, {
      adapter: this.#adapter,
      embedder: this.#embedding,
      activityLogger: this.#activityLogger,
    });
  }
}
